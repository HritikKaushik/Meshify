import express, { Router } from 'express';
import type { Queue } from 'bullmq';
import type { IntegrationRepository, WebhookEventRepository } from '@meshify/data-access';
import type { WebhookEventJobPayload } from '@meshify/queues';
import type { CredentialVault, ProviderRegistry, RawWebhookRequest } from '@meshify/providers';
import { supportsWebhooks } from '@meshify/providers';

/** BYOA webhook-secret credential kinds, tried in order (GitHub apps vs Slack apps name theirs differently). */
const BYOA_SECRET_KINDS = ['app_webhook_secret', 'app_signing_secret'];

export interface WebhookReceiverDeps {
	registry: ProviderRegistry;
	integrations: IntegrationRepository;
	webhookEvents: WebhookEventRepository;
	webhookQueue: Queue<WebhookEventJobPayload>;
	/** Managed-app webhook secrets per provider id (operator env — composition-root data, not provider knowledge). */
	managedSecrets: Map<string, string>;
	/** Resolves BYOA per-integration secrets. */
	vault: CredentialVault;
	limiter: { hit(identity: string): Promise<{ allowed: boolean }> };
	logger: { warn: (obj: unknown, msg: string) => void; error: (obj: unknown, msg: string) => void };
}

/**
 * The public webhook receiver — the ONLY unauthenticated mutating surface.
 * MUST be mounted before the global express.json()/authGuard stack: signatures
 * cover the exact raw bytes, so nothing may consume or reshape the body first.
 *
 * Receipt discipline: verify (timing-safe, before any I/O) → record the
 * delivery (unique per provider+delivery id — redeliveries are no-ops) →
 * enqueue → ACK in milliseconds. All provider API work happens in the worker.
 */
export function createWebhooksController(deps: WebhookReceiverDeps): Router {
	const router = Router();
	router.use('/v1/integrations/webhooks', express.raw({ type: () => true, limit: '2mb' }));

	router.post(['/v1/integrations/webhooks/:provider', '/v1/integrations/webhooks/:provider/:integrationId'], async (req, res) => {
		// Array route paths type params as string | string[] — normalize once.
		const providerId = String(req.params.provider ?? '');
		const integrationIdParam = req.params.integrationId ? String(req.params.integrationId) : undefined;
		try {
			const { allowed } = await deps.limiter.hit(`webhook:${providerId}`);
			if (!allowed) {
				res.status(429).json({ error: 'Too many webhook deliveries' });
				return;
			}

			const provider = deps.registry.find(providerId);
			if (!provider || !supportsWebhooks(provider)) {
				res.status(404).json({ error: 'Unknown webhook endpoint' });
				return;
			}

			// Secret resolution: per-integration (BYOA URL) or the managed app's.
			let secret: string | undefined;
			if (integrationIdParam) {
				for (const kind of BYOA_SECRET_KINDS) {
					const credential = await deps.vault.get(integrationIdParam, kind).catch(() => undefined);
					if (credential) {
						secret = credential.value;
						break;
					}
				}
			} else {
				secret = deps.managedSecrets.get(providerId);
			}
			if (!secret) {
				// Indistinguishable from an unknown endpoint — never confirm which integrations exist.
				res.status(404).json({ error: 'Unknown webhook endpoint' });
				return;
			}

			if (!Buffer.isBuffer(req.body)) {
				res.status(400).json({ error: 'Missing request body' });
				return;
			}
			const raw: RawWebhookRequest = {
				rawBody: req.body,
				headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
			};

			if (!provider.verifyWebhook(raw, secret)) {
				res.status(401).json({ error: 'Invalid webhook signature' });
				return;
			}

			const described = provider.describeWebhook(raw);
			if (described.kind === 'challenge') {
				res.status(200).type('application/json').send(described.response);
				return;
			}
			if (described.kind === 'ignore') {
				res.status(200).json({ ok: true });
				return;
			}

			// Resolve the integration this delivery belongs to.
			let integrationId: string | null = null;
			if (integrationIdParam) {
				const integration = await deps.integrations.findById(integrationIdParam);
				integrationId = integration && integration.provider === providerId ? integration.id : null;
			} else if (described.externalAccountId) {
				const candidates = await deps.integrations.findByProviderAccount(providerId, described.externalAccountId);
				if (candidates.length > 1) {
					deps.logger.warn({ providerId, externalAccountId: described.externalAccountId }, 'webhook grant claimed by multiple orgs — routing to the earliest claim');
				}
				integrationId = candidates[0]?.id ?? null;
			}

			const recorded = await deps.webhookEvents.recordIfNew({
				provider: providerId,
				deliveryId: described.deliveryId,
				eventType: described.eventType,
				integrationId,
				payload: JSON.parse(raw.rawBody.toString('utf8')) as Record<string, unknown>,
			});
			if (!recorded) {
				res.status(200).json({ ok: true, duplicate: true });
				return;
			}

			if (!integrationId) {
				// Verified but unclaimed (e.g. installation not yet connected in Meshify) — keep for audit, nothing to process.
				await deps.webhookEvents.markStatus(recorded.id, 'skipped', 'No integration claims this delivery');
				res.status(200).json({ ok: true });
				return;
			}

			await deps.webhookQueue.add('process', { webhookEventId: recorded.id }, { jobId: recorded.id });
			await deps.webhookEvents.markStatus(recorded.id, 'queued');
			res.status(200).json({ ok: true });
		} catch (err) {
			deps.logger.error({ err, providerId }, 'webhook receipt failed');
			res.status(500).json({ error: 'Webhook receipt failed' });
		}
	});

	return router;
}
