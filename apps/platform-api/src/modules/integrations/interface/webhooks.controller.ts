import express, { Router } from 'express';
import type { Queue } from 'bullmq';
import type { IntegrationRepository, WebhookEventRepository } from '@meshify/data-access';
import type { WebhookEventJobPayload } from '@meshify/queues';
import type { ProviderRegistrationService, ProviderRegistry, RawWebhookRequest, RegistrationContext } from '@meshify/providers';
import { supportsWebhooks } from '@meshify/providers';

/** Webhook-secret credential kinds, tried in order (GitHub apps vs Slack apps name theirs differently). */
const WEBHOOK_SECRET_KINDS = ['app_webhook_secret', 'app_signing_secret'];

async function webhookSecretOf(registration: RegistrationContext): Promise<string | undefined> {
	for (const kind of WEBHOOK_SECRET_KINDS) {
		const found = await registration.secrets.get(kind).catch(() => undefined);
		if (found) return found.value;
	}
	return undefined;
}

export interface WebhookReceiverDeps {
	registry: ProviderRegistry;
	integrations: IntegrationRepository;
	webhookEvents: WebhookEventRepository;
	webhookQueue: Queue<WebhookEventJobPayload>;
	/** Resolves the managed (deployment) or a specific BYOA registration for secret verification. */
	registrations: ProviderRegistrationService;
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

	router.post(['/v1/integrations/webhooks/:provider', '/v1/integrations/webhooks/:provider/:registrationId'], async (req, res) => {
		// Array route paths type params as string | string[] — normalize once.
		const providerId = String(req.params.provider ?? '');
		const registrationIdParam = req.params.registrationId ? String(req.params.registrationId) : undefined;
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

			// Secret resolution via the registration layer: the managed route
			// (/:provider) uses the deployment's managed app; the per-registration
			// route (/:provider/:registrationId) uses that BYOA app's secret.
			const registration = registrationIdParam ? await deps.registrations.resolveById(registrationIdParam) : deps.registrations.managedContext(providerId);
			const secret = registration && registration.provider === providerId ? await webhookSecretOf(registration) : undefined;
			if (!secret) {
				// Indistinguishable from an unknown endpoint — never confirm which registrations exist.
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

			// Resolve the integration this delivery belongs to by the payload's
			// external account (installation id / team id). CRITICAL isolation:
			// only ever consider integrations that belong to the registration
			// which verified this signature — the BYOA route matches that
			// registration id, the managed route matches managed (null)
			// integrations. `external_account_id` is NOT globally unique (Slack
			// team_id is shared across apps/orgs), so a fallback to the unscoped
			// cross-org candidate set would let a signed BYOA delivery bind
			// another org's managed integration. No fallback.
			let integrationId: string | null = null;
			if (described.externalAccountId) {
				const candidates = await deps.integrations.findByProviderAccount(providerId, described.externalAccountId);
				const chosen = registrationIdParam
					? candidates.filter((c) => c.registrationId === registrationIdParam)
					: candidates.filter((c) => c.registrationId === null);
				if (chosen.length > 1) {
					deps.logger.warn({ providerId, externalAccountId: described.externalAccountId }, 'webhook grant claimed by multiple integrations of the same registration — routing to the earliest');
				}
				integrationId = chosen[0]?.id ?? null;
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
