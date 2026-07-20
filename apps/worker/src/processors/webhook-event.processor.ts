import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import type {
	Integration,
	IntegrationRepository,
	IntegrationResourceRepository,
	KnowledgeConnector,
	KnowledgeConnectorRepository,
	PipelineJobRepository,
	RepositoryRepository,
	WebhookEventRepository,
} from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { SourceSyncJobPayload, WebhookEventJobPayload } from '@meshify/queues';
import type { CredentialVault, PlatformEvent, PlatformEventBus, ProviderRegistrationService, ProviderRegistry } from '@meshify/providers';
import { supportsWebhooks } from '@meshify/providers';

export interface WebhookEventProcessorDeps {
	registry: ProviderRegistry;
	webhookEvents: WebhookEventRepository;
	integrations: IntegrationRepository;
	connectors: KnowledgeConnectorRepository;
	resources: IntegrationResourceRepository;
	repositories: RepositoryRepository;
	pipelineJobs: PipelineJobRepository;
	sourceSyncQueue: Queue<SourceSyncJobPayload>;
	vault: CredentialVault;
	registrations: ProviderRegistrationService;
	bus: PlatformEventBus;
	/** Burst coalescing for chat-style activity (content.changed) — one sync per quiet window. */
	contentDebounceMs?: number;
}

const DEFAULT_CONTENT_DEBOUNCE_MS = 45_000;

/**
 * Turns a recorded webhook delivery into platform events and dispatches them.
 * Dispatch is done HERE (durable, BullMQ-retried) rather than by a Pub/Sub
 * subscriber — a crash can never lose a sync trigger; the bus publish that
 * follows each dispatch feeds the live consumers (org SSE, health surfacing).
 * Reprocessing a delivery is safe: sync enqueues are dedupe-keyed and status
 * flips are idempotent.
 */
export async function processWebhookEventJob(job: Job<WebhookEventJobPayload>, deps: WebhookEventProcessorDeps): Promise<void> {
	const event = await deps.webhookEvents.findById(job.data.webhookEventId);
	if (!event) return;
	if (event.status === 'processed' || event.status === 'skipped') return;

	try {
		if (!event.integrationId) {
			await deps.webhookEvents.markStatus(event.id, 'skipped', 'No integration claims this delivery');
			return;
		}
		const integration = await deps.integrations.findById(event.integrationId);
		if (!integration) {
			await deps.webhookEvents.markStatus(event.id, 'skipped', 'Integration no longer exists');
			return;
		}

		const provider = deps.registry.get(event.provider);
		if (!supportsWebhooks(provider)) {
			await deps.webhookEvents.markStatus(event.id, 'skipped', `Provider "${event.provider}" no longer handles webhooks`);
			return;
		}

		const registration = await deps.registrations.resolveForIntegration(integration);
		if (!registration) {
			await deps.webhookEvents.markStatus(event.id, 'skipped', `No provider registration resolves for ${integration.provider}`);
			return;
		}
		const platformEvents = await provider.normalizeWebhook(
			{ eventType: event.eventType, payload: event.payload },
			{ integration, vault: deps.vault.forIntegration(integration.id), registration }
		);

		for (const platformEvent of platformEvents) {
			await dispatch(platformEvent, integration, deps);
			await deps.bus.publish(platformEvent);
		}

		await deps.webhookEvents.markStatus(event.id, 'processed');
	} catch (err) {
		await deps.webhookEvents.markStatus(event.id, 'failed', err instanceof Error ? err.message : String(err)).catch(() => undefined);
		throw err; // BullMQ retries with backoff
	}
}

/** Maps the provider-independent event vocabulary onto platform actions. */
async function dispatch(event: PlatformEvent, integration: Integration, deps: WebhookEventProcessorDeps): Promise<void> {
	switch (event.kind) {
		case 'resource.updated': {
			for (const connector of await boundConnectors(deps, integration.id, event.externalResourceId)) {
				await enqueueIncrementalSync(deps, connector, 0);
			}
			return;
		}
		case 'content.changed': {
			// Chat-style activity: debounce-coalesce into one incremental sync per
			// connector; the sync's cursors make an over-triggered run cheap.
			for (const connector of await deps.connectors.listByIntegration(integration.id)) {
				await enqueueIncrementalSync(deps, connector, deps.contentDebounceMs ?? DEFAULT_CONTENT_DEBOUNCE_MS);
			}
			return;
		}
		case 'resource.removed': {
			await deps.resources.markRemoved(integration.id, [event.externalResourceId]);
			for (const connector of await boundConnectors(deps, integration.id, event.externalResourceId)) {
				await deps.connectors.updateStatus(connector.id, 'error', 'The connected source was removed at the provider');
			}
			return;
		}
		case 'resource.renamed': {
			await deps.resources.rename(integration.id, event.externalResourceId, event.name);
			if (event.resourceType === 'repository' && event.name.includes('/')) {
				const [owner, shortName] = event.name.split('/', 2) as [string, string];
				for (const repository of await deps.repositories.findByGitHubRepoId(event.externalResourceId)) {
					await deps.repositories.updateGitHubIdentity(repository.id, {
						owner,
						name: shortName,
						remoteUrl: `https://github.com/${event.name}`,
					});
				}
			}
			return;
		}
		case 'permission.changed': {
			if (event.removed.length > 0) {
				await deps.resources.markRemoved(integration.id, event.removed);
				for (const removedId of event.removed) {
					for (const connector of await boundConnectors(deps, integration.id, removedId)) {
						await deps.connectors.updateStatus(connector.id, 'error', 'Access to this source was revoked at the provider');
					}
				}
			}
			return;
		}
		case 'connection.revoked': {
			await deps.integrations.updateStatus(integration.id, 'revoked', 'Uninstalled/revoked at the provider');
			await deps.integrations.updateHealth(integration.id, 'disconnected');
			for (const connector of await deps.connectors.listByIntegration(integration.id)) {
				await deps.connectors.updateStatus(connector.id, 'disconnected', 'The integration was revoked at the provider');
			}
			return;
		}
		case 'connection.suspended': {
			await deps.integrations.updateStatus(integration.id, 'error', 'Suspended at the provider');
			await deps.integrations.updateHealth(integration.id, 'needs_reauthorization');
			return;
		}
		case 'health.changed': {
			await deps.integrations.updateHealth(integration.id, event.health as never, event.detail);
			return;
		}
		default:
			return; // informational kinds need no dispatch — bus subscribers may still care
	}
}

/** Connectors bound to a canonical resource (config.resourceIds — the provider-agnostic binding). */
async function boundConnectors(deps: WebhookEventProcessorDeps, integrationId: string, resourceId: string): Promise<KnowledgeConnector[]> {
	const connectors = await deps.connectors.listByIntegration(integrationId);
	return connectors.filter((c) => Array.isArray(c.config.resourceIds) && (c.config.resourceIds as string[]).includes(resourceId));
}

async function enqueueIncrementalSync(deps: WebhookEventProcessorDeps, connector: KnowledgeConnector, delayMs: number): Promise<void> {
	const { job, created } = await deps.pipelineJobs.createDeduped({
		id: randomUUID(),
		projectId: connector.projectId,
		jobType: 'source_sync',
		payload: { connectorId: connector.id, mode: 'incremental', reason: 'webhook' },
		dedupeKey: `source_sync:${connector.id}:incremental`,
	});
	if (!created) return; // a queued sync already covers this burst
	await deps.sourceSyncQueue.add(
		'sync',
		{ pipelineJobId: job.id, connectorId: connector.id, projectId: connector.projectId, mode: 'incremental' },
		{ jobId: job.id, delay: delayMs }
	);
}
