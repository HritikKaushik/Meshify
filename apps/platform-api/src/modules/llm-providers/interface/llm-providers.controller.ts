import { Router } from 'express';
import { z } from 'zod';
import {
	LlmAuthError,
	LlmConfigError,
	LlmProviderError,
	LlmProviderNotFoundError,
	LlmQuotaError,
	LlmRateLimitError,
	LlmTimeoutError,
	LlmUnavailableError,
} from '@meshify/ai';
import type { ListLlmProvidersUseCase } from '../application/list-llm-providers.usecase.js';
import type { GetLlmProviderUseCase } from '../application/get-llm-provider.usecase.js';
import type { ConnectLlmProviderUseCase } from '../application/connect-llm-provider.usecase.js';
import type { TestLlmProviderUseCase } from '../application/test-llm-provider.usecase.js';
import type { ActivateLlmProviderUseCase } from '../application/activate-llm-provider.usecase.js';
import type { DisconnectLlmProviderUseCase } from '../application/disconnect-llm-provider.usecase.js';
import type { ListLlmModelsUseCase } from '../application/list-llm-models.usecase.js';
import { LlmProviderConfigNotFoundError, LlmProviderValidationError } from '../application/llm-provider-support.js';
import { LlmProviderForbiddenError, requireLlmAdmin } from '../authorization/llm-authorization.js';

const connectSchema = z.object({
	values: z.record(z.string(), z.string()).default({}),
	defaultModel: z.string().optional(),
});

const testSchema = z.object({
	values: z.record(z.string(), z.string()).optional(),
	model: z.string().optional(),
});

const activateSchema = z.object({
	/** The project the caller is about to chat in — its pipeline is warmed synchronously. */
	projectId: z.string().uuid().optional(),
});

function mapError(err: unknown, res: import('express').Response, log?: { error: (obj: unknown, msg: string) => void }): void {
	if (err instanceof LlmProviderNotFoundError || err instanceof LlmProviderConfigNotFoundError) {
		res.status(404).json({ error: err.message });
	} else if (err instanceof LlmProviderForbiddenError) {
		res.status(403).json({ error: err.message });
	} else if (err instanceof LlmProviderValidationError || err instanceof LlmConfigError || err instanceof LlmAuthError) {
		res.status(400).json({ error: err.message });
	} else if (err instanceof LlmRateLimitError) {
		res.status(429).json({ error: err.message });
	} else if (err instanceof LlmQuotaError) {
		res.status(402).json({ error: err.message });
	} else if (err instanceof LlmUnavailableError || err instanceof LlmTimeoutError) {
		log?.error({ err: err.message }, 'llm provider unavailable');
		res.status(502).json({ error: err.message });
	} else if (err instanceof LlmProviderError) {
		res.status(400).json({ error: err.message });
	} else {
		log?.error({ err }, 'llm provider request failed');
		res.status(502).json({ error: 'AI provider operation failed — see server logs' });
	}
}

/**
 * The AI Providers REST surface: `/v1/providers/llm/*`. A dedicated namespace,
 * parallel to the knowledge-source `/v1/providers` catalog, reflecting that AI
 * providers are a separate subsystem. Read routes are open to any authenticated
 * org member; mutating routes pass through `requireLlmAdmin` (the RBAC seam).
 */
export function createLlmProvidersController(deps: {
	listLlmProviders: ListLlmProvidersUseCase;
	getLlmProvider: GetLlmProviderUseCase;
	connectLlmProvider: ConnectLlmProviderUseCase;
	testLlmProvider: TestLlmProviderUseCase;
	activateLlmProvider: ActivateLlmProviderUseCase;
	disconnectLlmProvider: DisconnectLlmProviderUseCase;
	listLlmModels: ListLlmModelsUseCase;
}): Router {
	const router = Router();

	// Catalog: every provider + this org's config/active state (AI Models cards).
	router.get('/v1/providers/llm', async (req, res) => {
		try {
			res.status(200).json(await deps.listLlmProviders.execute(req.auth!.orgId));
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Detail: manifest + masked credential fields + models + config.
	router.get('/v1/providers/llm/:provider', async (req, res) => {
		try {
			res.status(200).json(await deps.getLlmProvider.execute({ orgId: req.auth!.orgId, provider: req.params.provider! }));
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Available models (static catalog or live fetch for dynamic providers).
	router.get('/v1/providers/llm/:provider/models', async (req, res) => {
		try {
			res.status(200).json(await deps.listLlmModels.execute({ orgId: req.auth!.orgId, provider: req.params.provider! }));
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Save credentials (BYOA) + config. Admin-gated (RBAC seam).
	router.post('/v1/providers/llm/:provider/connect', async (req, res) => {
		const parsed = connectSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			requireLlmAdmin(req.auth!);
			const result = await deps.connectLlmProvider.execute({
				orgId: req.auth!.orgId,
				provider: req.params.provider!,
				values: parsed.data.values,
				defaultModel: parsed.data.defaultModel,
			});
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Live connection test — returns { ok, models, latencyMs, region?, error? }.
	router.post('/v1/providers/llm/:provider/test', async (req, res) => {
		const parsed = testSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			requireLlmAdmin(req.auth!);
			const result = await deps.testLlmProvider.execute({
				orgId: req.auth!.orgId,
				provider: req.params.provider!,
				values: parsed.data.values,
				model: parsed.data.model,
			});
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Make this provider the org's single active provider. An optional projectId
	// makes the call block until that project's RocketRide pipeline is (re)built,
	// so the UI can hold a loader and the user never chats mid-build.
	router.post('/v1/providers/llm/:provider/activate', async (req, res) => {
		const parsed = activateSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			requireLlmAdmin(req.auth!);
			const result = await deps.activateLlmProvider.execute({
				orgId: req.auth!.orgId,
				provider: req.params.provider!,
				projectId: parsed.data.projectId,
			});
			res.status(200).json(result);
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	// Disconnect: purge credentials + config (cascades active + credentials rows).
	router.delete('/v1/providers/llm/:provider', async (req, res) => {
		try {
			requireLlmAdmin(req.auth!);
			await deps.disconnectLlmProvider.execute({ orgId: req.auth!.orgId, provider: req.params.provider! });
			res.status(204).send();
		} catch (err) {
			mapError(err, res, req.log);
		}
	});

	return router;
}
