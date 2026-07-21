import { Router } from 'express';
import { z } from 'zod';
import type { Integration } from '@meshify/data-access';
import { ProviderAuthError, ProviderNotConfiguredError, ProviderNotFoundError } from '@meshify/providers';
import type { StampedPlatformEvent } from '@meshify/providers';
import type { ListProvidersUseCase } from '../application/list-providers.usecase.js';
import type { ListIntegrationsUseCase } from '../application/list-integrations.usecase.js';
import type { ConnectProviderUseCase } from '../application/connect-provider.usecase.js';
import { ProjectNotInOrgError } from '../application/connect-provider.usecase.js';
import type { CompleteConnectUseCase } from '../application/complete-connect.usecase.js';
import type { ReconnectIntegrationUseCase } from '../application/reconnect-integration.usecase.js';
import type { DisconnectIntegrationUseCase } from '../application/disconnect-integration.usecase.js';
import type { ListIntegrationResourcesUseCase } from '../application/list-integration-resources.usecase.js';
import type { ConfigureRegistrationUseCase, DescribeRegistrationUseCase, DeleteRegistrationUseCase } from '../application/configure-registration.usecase.js';
import { RegistrationInUseError } from '../application/configure-registration.usecase.js';
import type { IntegrationEventHub } from '../infrastructure/integration-event-hub.js';
import { IntegrationNotFoundError, InvalidOAuthStateError, UnsupportedProviderOperationError } from '../application/integration-support.js';
import { OrgAdminForbiddenError, requireOrgAdmin } from '../../security/authorization/org-authorization.js';
import { requireUuidParams } from '../../../http/require-uuid-params.js';
import { ProviderConfigError } from '@meshify/providers';

const SSE_HEARTBEAT_MS = 15_000;

const connectSchema = z.object({
	projectId: z.string().uuid().optional(),
	returnPath: z.string().max(500).optional(),
});

const callbackSchema = z.object({
	state: z.string().min(1),
	/** Raw provider redirect params, passed through verbatim by the SPA callback page. */
	params: z.record(z.string(), z.string().optional()).default({}),
});

const reconnectSchema = z.object({
	returnPath: z.string().max(500).optional(),
});

/** Integration DTO — display facts only; credentials never leave the vault. */
function toResponse(integration: Integration) {
	return {
		id: integration.id,
		provider: integration.provider,
		mode: integration.mode,
		externalAccountId: integration.externalAccountId,
		externalAccountName: integration.externalAccountName,
		status: integration.status,
		health: integration.health,
		healthCheckedAt: integration.healthCheckedAt?.toISOString() ?? null,
		// Whitelisted metadata: never spread provider metadata wholesale into a DTO.
		accountType: typeof integration.metadata.accountType === 'string' ? integration.metadata.accountType : null,
		avatarUrl: typeof integration.metadata.avatarUrl === 'string' ? integration.metadata.avatarUrl : null,
		lastError: integration.lastError,
		createdAt: integration.createdAt.toISOString(),
		updatedAt: integration.updatedAt.toISOString(),
	};
}

function mapError(err: unknown, res: import('express').Response, log?: { error: (obj: unknown, msg: string) => void }): void {
	if (err instanceof OrgAdminForbiddenError) {
		res.status(403).json({ error: err.message });
	} else if (err instanceof ProviderNotFoundError || err instanceof IntegrationNotFoundError) {
		res.status(404).json({ error: err.message });
	} else if (err instanceof ProviderNotConfiguredError) {
		res.status(503).json({ error: err.message });
	} else if (err instanceof InvalidOAuthStateError || err instanceof ProviderAuthError || err instanceof UnsupportedProviderOperationError || err instanceof ProviderConfigError) {
		// Security-relevant (replayed/expired/cross-tenant state, failed provider
		// verification) — log at warn so it's diagnosable; the response stays terse.
		log?.error({ err: err.message, kind: err.name }, 'integration request rejected');
		res.status(400).json({ error: err.message });
	} else if (err instanceof ProjectNotInOrgError) {
		res.status(404).json({ error: err.message });
	} else if (err instanceof RegistrationInUseError) {
		res.status(409).json({ error: err.message });
	} else {
		log?.error({ err }, 'integrations request failed');
		res.status(502).json({ error: 'Integration operation failed — see server logs' });
	}
}

export function createIntegrationsController(deps: {
	listProviders: ListProvidersUseCase;
	listIntegrations: ListIntegrationsUseCase;
	connectProvider: ConnectProviderUseCase;
	completeConnect: CompleteConnectUseCase;
	reconnectIntegration: ReconnectIntegrationUseCase;
	disconnectIntegration: DisconnectIntegrationUseCase;
	listIntegrationResources: ListIntegrationResourcesUseCase;
	describeRegistration: DescribeRegistrationUseCase;
	configureRegistration: ConfigureRegistrationUseCase;
	deleteRegistration: DeleteRegistrationUseCase;
	integrationEvents: IntegrationEventHub;
}): Router {
	const router = Router();
	const configSchema = z.object({ values: z.record(z.string(), z.string()) });

	// The marketplace catalog: provider manifests + whether THIS org can operate each.
	router.get('/v1/providers', async (req, res) => {
		const entries = await deps.listProviders.execute(req.auth!.orgId);
		res.status(200).json(entries.map((entry) => ({ ...entry.manifest, configured: entry.configured })));
	});

	router.get('/v1/integrations', async (req, res) => {
		const summaries = await deps.listIntegrations.execute(req.auth!.orgId);
		res.status(200).json(
			summaries.map((s) => ({ ...toResponse(s.integration), connectorCount: s.connectorCount, connectedProjectIds: s.connectedProjectIds }))
		);
	});

	router.post('/v1/integrations/:provider/connect', async (req, res) => {
		const parsed = connectSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			requireOrgAdmin(req.auth!, 'connect integrations');
			const result = await deps.connectProvider.execute({
				orgId: req.auth!.orgId,
				provider: req.params.provider!,
				projectId: parsed.data.projectId,
				returnPath: parsed.data.returnPath,
				createdByKeyId: req.auth!.keyId,
			});
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	router.post('/v1/integrations/:provider/callback', async (req, res) => {
		const parsed = callbackSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			requireOrgAdmin(req.auth!, 'connect integrations');
			const result = await deps.completeConnect.execute({
				orgId: req.auth!.orgId,
				provider: req.params.provider!,
				stateToken: parsed.data.state,
				params: parsed.data.params,
			});
			res.status(200).json({
				integration: toResponse(result.integration),
				returnPath: result.returnPath,
				projectId: result.projectId,
				intent: result.intent,
			});
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	router.post('/v1/integrations/:integrationId/reconnect', requireUuidParams('integrationId'), async (req, res) => {
		const parsed = reconnectSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			requireOrgAdmin(req.auth!, 'reconnect integrations');
			const result = await deps.reconnectIntegration.execute({
				orgId: req.auth!.orgId,
				integrationId: req.params.integrationId as string,
				returnPath: parsed.data.returnPath,
				createdByKeyId: req.auth!.keyId,
			});
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	router.delete('/v1/integrations/:integrationId', requireUuidParams('integrationId'), async (req, res) => {
		try {
			requireOrgAdmin(req.auth!, 'disconnect integrations');
			await deps.disconnectIntegration.execute({ orgId: req.auth!.orgId, integrationId: req.params.integrationId as string });
			res.status(204).send();
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	router.get('/v1/integrations/:integrationId/resources', requireUuidParams('integrationId'), async (req, res) => {
		try {
			const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
			const result = await deps.listIntegrationResources.execute({
				orgId: req.auth!.orgId,
				integrationId: req.params.integrationId as string,
				cursor,
			});
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Organization Provider Registration (enterprise BYOA): describe the
	// provider's app-registration form (secrets never echoed — only whether
	// they're set) and store the org's own app credentials.
	router.get('/v1/providers/:provider/registration', async (req, res) => {
		try {
			const result = await deps.describeRegistration.execute({ orgId: req.auth!.orgId, provider: req.params.provider! });
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	router.put('/v1/providers/:provider/registration', async (req, res) => {
		const parsed = configSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			requireOrgAdmin(req.auth!, 'manage provider registrations');
			const result = await deps.configureRegistration.execute({ orgId: req.auth!.orgId, provider: req.params.provider!, values: parsed.data.values });
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Remove the org's BYOA registration for a provider (revert to managed). 409 if integrations still use it.
	router.delete('/v1/providers/:provider/registration', async (req, res) => {
		try {
			requireOrgAdmin(req.auth!, 'manage provider registrations');
			await deps.deleteRegistration.execute({ orgId: req.auth!.orgId, provider: req.params.provider! });
			res.status(204).end();
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Live org-scoped integration events (connects, revocations, health flips).
	router.get('/v1/integrations/stream', (req, res) => {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			// Defeat proxy/ingress response buffering so events flush immediately.
			'X-Accel-Buffering': 'no',
		});
		res.flushHeaders?.();

		const write = (event: StampedPlatformEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
		const unsubscribe = deps.integrationEvents.subscribe(req.auth!.orgId, write);
		const heartbeat = setInterval(() => res.write(': keepalive\n\n'), SSE_HEARTBEAT_MS);

		req.on('close', () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
	});

	return router;
}
