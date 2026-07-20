import { describe, expect, it } from 'vitest';
import type { Job } from 'bullmq';
import type { WebhookEventJobPayload } from '@meshify/queues';
import { processWebhookEventJob, type WebhookEventProcessorDeps } from './webhook-event.processor.js';
import {
	InMemoryIntegrationRepository,
	InMemoryIntegrationResourceRepository,
	InMemoryKnowledgeConnectorRepository,
	InMemoryPipelineJobRepository,
	InMemoryRepositoryRepository,
	InMemoryWebhookEventRepository,
} from '@meshify/testing';
import { CredentialVault, ProviderRegistry, CURRENT_MANIFEST_VERSION, NO_CAPABILITIES } from '@meshify/providers';
import type { PlatformEvent, Provider, WebhookCapable } from '@meshify/providers';
import { InMemoryCredentialStore, InMemoryPlatformEventBus, buildIntegration, fakeCipher } from '@meshify/providers/testing';

/** Provider whose normalizeWebhook is scripted per event type — dispatch must be provider-blind. */
function scriptedProvider(script: Record<string, (base: { provider: string; integrationId: string; orgId: string }) => PlatformEvent[]>): Provider & WebhookCapable {
	return {
		manifest: {
			id: 'fakehub',
			manifestVersion: CURRENT_MANIFEST_VERSION,
			providerVersion: '1.0.0',
			displayName: 'FakeHub',
			category: 'code',
			availability: 'available',
			capabilities: { ...NO_CAPABILITIES, webhooks: true },
			auth: { type: 'oauth2' },
			iconKey: 'fakehub',
			summary: 'fake',
		},
		verifyWebhook: () => true,
		describeWebhook: () => ({ kind: 'ignore', reason: 'unused in this test' }),
		normalizeWebhook: async (event, ctx) =>
			(script[event.eventType] ?? (() => []))({ provider: 'fakehub', integrationId: ctx.integration.id, orgId: ctx.integration.orgId }),
	};
}

function harness(script: Parameters<typeof scriptedProvider>[0]) {
	const registry = new ProviderRegistry();
	registry.register(scriptedProvider(script));
	const integration = buildIntegration({ id: 'int-1', provider: 'fakehub', orgId: 'org-1', externalAccountId: 'acct', status: 'active' });
	const deps: WebhookEventProcessorDeps = {
		registry,
		webhookEvents: new InMemoryWebhookEventRepository(),
		integrations: new InMemoryIntegrationRepository([integration]),
		connectors: new InMemoryKnowledgeConnectorRepository(),
		resources: new InMemoryIntegrationResourceRepository(),
		repositories: new InMemoryRepositoryRepository(),
		pipelineJobs: new InMemoryPipelineJobRepository(),
		sourceSyncQueue: {
			add: async (_n: string, payload: unknown, opts: unknown) => void enqueued.push({ payload, opts }),
		} as never,
		vault: new CredentialVault(new InMemoryCredentialStore(), fakeCipher),
		bus: new InMemoryPlatformEventBus(),
		contentDebounceMs: 1000,
	};
	const enqueued: Array<{ payload: unknown; opts: unknown }> = [];
	(deps.sourceSyncQueue as { add: unknown }).add = async (_n: string, payload: unknown, opts: unknown) => void enqueued.push({ payload, opts });
	return { deps, enqueued, integration };
}

async function record(deps: WebhookEventProcessorDeps, eventType: string): Promise<Job<WebhookEventJobPayload>> {
	const event = await deps.webhookEvents.recordIfNew({ provider: 'fakehub', deliveryId: `d-${eventType}-${Math.random()}`, eventType, integrationId: 'int-1', payload: {} });
	return { data: { webhookEventId: event!.id } } as Job<WebhookEventJobPayload>;
}

describe('processWebhookEventJob', () => {
	it('resource.updated syncs exactly the connectors bound to the resource, immediately', async () => {
		const h = harness({ push: (base) => [{ ...base, kind: 'resource.updated', resourceType: 'repository', externalResourceId: '42' }] });
		await h.deps.connectors.create({ id: 'conn-bound', projectId: 'p1', type: 'fakehub', displayName: 'x', integrationId: 'int-1', config: { resourceIds: ['42'] } });
		await h.deps.connectors.create({ id: 'conn-other', projectId: 'p2', type: 'fakehub', displayName: 'y', integrationId: 'int-1', config: { resourceIds: ['77'] } });

		await processWebhookEventJob(await record(h.deps, 'push'), h.deps);

		expect(h.enqueued).toHaveLength(1);
		expect(h.enqueued[0]!.payload).toMatchObject({ connectorId: 'conn-bound', mode: 'incremental' });
		expect(h.enqueued[0]!.opts).toMatchObject({ delay: 0 });
		const events = [...(h.deps.webhookEvents as InMemoryWebhookEventRepository).events.values()];
		expect(events[0]!.status).toBe('processed');
		expect((h.deps.bus as InMemoryPlatformEventBus).published.map((e) => e.kind)).toEqual(['resource.updated']);
	});

	it('content.changed debounces: bursts collapse to one queued sync per connector', async () => {
		const h = harness({ message: (base) => [{ ...base, kind: 'content.changed', scopeRef: 'C1' }] });
		await h.deps.connectors.create({ id: 'conn-ws', projectId: 'p1', type: 'fakehub', displayName: 'ws', integrationId: 'int-1', config: {} });

		await processWebhookEventJob(await record(h.deps, 'message'), h.deps);
		await processWebhookEventJob(await record(h.deps, 'message'), h.deps);
		await processWebhookEventJob(await record(h.deps, 'message'), h.deps);

		expect(h.enqueued).toHaveLength(1); // dedupe key collapsed the burst
		expect(h.enqueued[0]!.opts).toMatchObject({ delay: 1000 });
	});

	it('connection.revoked flips integration status/health and disconnects every dependent connector', async () => {
		const h = harness({ uninstall: (base) => [{ ...base, kind: 'connection.revoked' }] });
		await h.deps.connectors.create({ id: 'c1', projectId: 'p1', type: 'fakehub', displayName: 'x', integrationId: 'int-1', config: {} });
		await h.deps.connectors.create({ id: 'c2', projectId: 'p2', type: 'fakehub', displayName: 'y', integrationId: 'int-1', config: {} });

		await processWebhookEventJob(await record(h.deps, 'uninstall'), h.deps);

		const integration = await h.deps.integrations.findById('int-1');
		expect(integration).toMatchObject({ status: 'revoked', health: 'disconnected' });
		expect((await h.deps.connectors.listByIntegration('int-1')).map((c) => c.status)).toEqual(['disconnected', 'disconnected']);
	});

	it('permission.changed soft-removes inventory entries and flags bound connectors', async () => {
		const h = harness({ grant: (base) => [{ ...base, kind: 'permission.changed', added: [], removed: ['42'] }] });
		await h.deps.resources.upsertMany([{ integrationId: 'int-1', resourceId: '42', kind: 'repository', name: 'acme/api' }]);
		await h.deps.connectors.create({ id: 'conn-bound', projectId: 'p1', type: 'fakehub', displayName: 'x', integrationId: 'int-1', config: { resourceIds: ['42'] } });

		await processWebhookEventJob(await record(h.deps, 'grant'), h.deps);

		expect((await h.deps.resources.findByResourceId('int-1', '42'))?.removedAt).not.toBeNull();
		expect((await h.deps.connectors.findById('conn-bound'))?.status).toBe('error');
	});

	it('reprocessing a processed delivery is a no-op (BullMQ retry safety)', async () => {
		const h = harness({ push: (base) => [{ ...base, kind: 'resource.updated', resourceType: 'repository', externalResourceId: '42' }] });
		await h.deps.connectors.create({ id: 'conn-bound', projectId: 'p1', type: 'fakehub', displayName: 'x', integrationId: 'int-1', config: { resourceIds: ['42'] } });
		const job = await record(h.deps, 'push');

		await processWebhookEventJob(job, h.deps);
		await processWebhookEventJob(job, h.deps);

		expect(h.enqueued).toHaveLength(1);
	});
});
