import { describe, expect, it } from 'vitest';
import type { Job } from 'bullmq';
import type { IntegrationMaintenanceJobPayload } from '@meshify/queues';
import { processMaintenanceJob, type MaintenanceProcessorDeps } from './integration-maintenance.processor.js';
import {
	InMemoryIntegrationCredentialRepository,
	InMemoryIntegrationRepository,
	InMemoryKnowledgeConnectorRepository,
	InMemoryPipelineJobRepository,
	InMemoryWebhookEventRepository,
} from '@meshify/testing';
import { CredentialVault, ProviderRegistry, CURRENT_MANIFEST_VERSION, NO_CAPABILITIES } from '@meshify/providers';
import type { CredentialRefresh, IntegrationContext, Provider, ProviderHealthReport } from '@meshify/providers';
import { InMemoryPlatformEventBus, buildIntegration, fakeCipher, fakeRegistration } from '@meshify/providers/testing';

const NOW = new Date('2026-07-20T12:00:00.000Z');

function fakeProvider(behavior: {
	refresh?: (ctx: IntegrationContext) => Promise<CredentialRefresh | null>;
	health?: (ctx: IntegrationContext) => Promise<ProviderHealthReport>;
}): Provider {
	return {
		manifest: {
			id: 'fakehub',
			manifestVersion: CURRENT_MANIFEST_VERSION,
			providerVersion: '1.0.0',
			displayName: 'FakeHub',
			category: 'chat',
			availability: 'available',
			capabilities: { ...NO_CAPABILITIES, oauth: true, healthCheck: Boolean(behavior.health) },
			auth: { type: 'oauth2' },
			iconKey: 'fakehub',
			summary: 'fake',
		},
		buildConnectUrl: () => 'https://x',
		completeConnect: async () => ({ externalAccountId: 'a', externalAccountName: 'a', metadata: {}, credentials: [] }),
		refreshCredentials: behavior.refresh,
		checkHealth: behavior.health,
	} as never;
}

function harness(provider: Provider, integrationOverrides: Parameters<typeof buildIntegration>[0] = {}) {
	const registry = new ProviderRegistry();
	registry.register(provider);
	const integration = buildIntegration({ id: 'int-1', provider: 'fakehub', orgId: 'org-1', status: 'active', ...integrationOverrides });
	const credentials = new InMemoryIntegrationCredentialRepository();
	// Wire the vault to the SAME fixed clock as the processor — otherwise its
	// get()/expiry check uses the real system clock and any credential the test
	// stores with an expiry relative to NOW reads as expired once real time
	// passes that instant (a date-triggered flake).
	const vault = new CredentialVault(credentials, fakeCipher, () => NOW);
	const enqueued: unknown[] = [];
	const deps: MaintenanceProcessorDeps = {
		registry,
		integrations: new InMemoryIntegrationRepository([integration]),
		credentials,
		connectors: new InMemoryKnowledgeConnectorRepository(),
		pipelineJobs: new InMemoryPipelineJobRepository(),
		oauthStates: { create: async () => ({} as never), consumeByHash: async () => undefined, deleteExpiredBefore: async () => 3 },
		webhookEvents: new InMemoryWebhookEventRepository(),
		sourceSyncQueue: { add: async (_n: string, payload: unknown) => void enqueued.push(payload) } as never,
		webhookQueue: { add: async () => undefined } as never,
		vault,
		registrations: { resolveForIntegration: async () => fakeRegistration() } as never,
		bus: new InMemoryPlatformEventBus(),
		logger: { info: () => undefined, warn: () => undefined },
		now: () => NOW,
	};
	return { deps, vault, credentials, enqueued, integration };
}

const jobFor = (task: 'refresh' | 'health' | 'retention') => ({ data: { task } }) as Job<IntegrationMaintenanceJobPayload>;

describe('processMaintenanceJob', () => {
	it('refresh: rotates credentials expiring inside the margin and stores the new pair', async () => {
		const provider = fakeProvider({
			refresh: async () => ({
				credentials: [
					{ kind: 'access_token', value: 'fresh-token', expiresAt: new Date(NOW.getTime() + 12 * 3600 * 1000) },
					{ kind: 'refresh_token', value: 'fresh-refresh', expiresAt: null },
				],
			}),
		});
		const h = harness(provider);
		await h.vault.put('int-1', 'access_token', 'stale-token', new Date(NOW.getTime() + 10 * 60 * 1000)); // inside 30min margin

		await processMaintenanceJob(jobFor('refresh'), h.deps);

		expect((await h.vault.get('int-1', 'access_token'))?.value).toBe('fresh-token');
		expect((await h.vault.get('int-1', 'refresh_token'))?.value).toBe('fresh-refresh');
	});

	it('refresh: ignores lazily-minted installation tokens and healthy long-lived credentials', async () => {
		let refreshCalls = 0;
		const provider = fakeProvider({ refresh: async () => (refreshCalls++, null) });
		const h = harness(provider);
		await h.vault.put('int-1', 'installation_token', 'ghs', new Date(NOW.getTime() + 60 * 1000));
		await h.vault.put('int-1', 'access_token', 'xoxb', new Date(NOW.getTime() + 6 * 3600 * 1000)); // outside margin

		await processMaintenanceJob(jobFor('refresh'), h.deps);
		expect(refreshCalls).toBe(0);
	});

	it('refresh failure flips health to needs_reauthorization and emits health.changed', async () => {
		const provider = fakeProvider({ refresh: async () => Promise.reject(new Error('invalid_refresh_token')) });
		const h = harness(provider);
		await h.vault.put('int-1', 'access_token', 'stale', new Date(NOW.getTime() + 60 * 1000));

		await processMaintenanceJob(jobFor('refresh'), h.deps);

		expect((await h.deps.integrations.findById('int-1'))?.health).toBe('needs_reauthorization');
		expect((h.deps.bus as InMemoryPlatformEventBus).published.map((e) => e.kind)).toEqual(['health.changed']);
	});

	it('refresh: schedules reconcile syncs for stale event-triggered and due interval connectors, deduped', async () => {
		const h = harness(fakeProvider({}));
		const old = new Date(NOW.getTime() - 48 * 3600 * 1000);
		await h.deps.connectors.create({ id: 'c-stale', projectId: 'p1', type: 'fakehub', displayName: 'x', integrationId: 'int-1', config: {}, status: 'active' });
		await h.deps.connectors.create({ id: 'c-interval', projectId: 'p1', type: 'fakehub', displayName: 'y', integrationId: 'int-1', config: {}, status: 'active', syncPolicy: { trigger: 'interval', intervalMinutes: 30 } });
		// Backdate both (in-memory rows carry TEST_EPOCH timestamps ≪ NOW already via factories' epoch).
		for (const id of ['c-stale', 'c-interval']) {
			const c = await h.deps.connectors.findById(id);
			(c as { updatedAt: Date }).updatedAt = old;
		}

		await processMaintenanceJob(jobFor('refresh'), h.deps);
		const distinctConnectors = new Set(h.enqueued.map((p) => (p as { connectorId: string }).connectorId));
		expect(distinctConnectors).toEqual(new Set(['c-stale', 'c-interval']));

		// Re-running must not create DUPLICATE pipeline jobs (dedupe keys) — even
		// though the recovery sweep re-drives the still-queued jobs onto the queue.
		const jobsAfterFirst = new Set(h.enqueued.map((p) => (p as { pipelineJobId: string }).pipelineJobId));
		await processMaintenanceJob(jobFor('refresh'), h.deps);
		const allPipelineJobIds = new Set(h.enqueued.map((p) => (p as { pipelineJobId: string }).pipelineJobId));
		expect(allPipelineJobIds).toEqual(jobsAfterFirst); // no new job ids — dedup held
	});

	it('health: publishes health.changed only on transitions', async () => {
		let health: ProviderHealthReport = { health: 'healthy' };
		const provider = fakeProvider({ health: async () => health });
		const h = harness(provider, { health: 'unknown' });

		await processMaintenanceJob(jobFor('health'), h.deps);
		expect((await h.deps.integrations.findById('int-1'))?.health).toBe('healthy');
		expect((h.deps.bus as InMemoryPlatformEventBus).published).toHaveLength(1);

		await processMaintenanceJob(jobFor('health'), h.deps); // unchanged → no event
		expect((h.deps.bus as InMemoryPlatformEventBus).published).toHaveLength(1);

		health = { health: 'needs_reauthorization', detail: { error: 'token_revoked' } };
		await processMaintenanceJob(jobFor('health'), h.deps);
		expect((h.deps.bus as InMemoryPlatformEventBus).published).toHaveLength(2);
	});

	it('retention: prunes terminal webhook events and expired oauth states', async () => {
		const h = harness(fakeProvider({}));
		const events = h.deps.webhookEvents as InMemoryWebhookEventRepository;
		const recorded = await events.recordIfNew({ provider: 'fakehub', deliveryId: 'd1', eventType: 'x', integrationId: 'int-1', payload: {} });
		await events.markStatus(recorded!.id, 'processed');

		await processMaintenanceJob(jobFor('retention'), h.deps);
		expect(events.events.size).toBe(0);
	});
});
