import { randomUUID } from 'node:crypto';
import type { Job, Queue } from 'bullmq';
import type {
	IntegrationCredentialRepository,
	IntegrationRepository,
	KnowledgeConnector,
	KnowledgeConnectorRepository,
	OAuthStateRepository,
	PipelineJobRepository,
	WebhookEventRepository,
} from '@meshify/data-access';
import type { IntegrationMaintenanceJobPayload, SourceSyncJobPayload } from '@meshify/queues';
import type { CredentialVault, PlatformEventBus, ProviderRegistry } from '@meshify/providers';
import { supportsHealthCheck, supportsOAuth } from '@meshify/providers';

export interface MaintenanceProcessorDeps {
	registry: ProviderRegistry;
	integrations: IntegrationRepository;
	credentials: IntegrationCredentialRepository;
	connectors: KnowledgeConnectorRepository;
	pipelineJobs: PipelineJobRepository;
	oauthStates: OAuthStateRepository;
	webhookEvents: WebhookEventRepository;
	sourceSyncQueue: Queue<SourceSyncJobPayload>;
	vault: CredentialVault;
	bus: PlatformEventBus;
	logger: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void };
	now?: () => Date;
}

/** Refresh anything expiring within this margin — comfortably ahead of Slack's 12h rotation window. */
const REFRESH_MARGIN_MS = 30 * 60 * 1000;
/** Event-triggered connectors idle longer than this get a reconcile sync (webhooks miss events). */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Installation tokens are minted lazily by the vault — sweeping them would just churn. */
const LAZY_KINDS = new Set(['installation_token']);
const WEBHOOK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const STATE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** The platform's upkeep loop; every sweep is idempotent and safe to re-run. */
export async function processMaintenanceJob(job: Job<IntegrationMaintenanceJobPayload>, deps: MaintenanceProcessorDeps): Promise<void> {
	const now = (deps.now ?? (() => new Date()))();
	switch (job.data.task) {
		case 'refresh':
			await refreshExpiringCredentials(deps, now);
			await reconcileSyncs(deps, now);
			return;
		case 'health':
			await sweepHealth(deps);
			return;
		case 'retention': {
			const events = await deps.webhookEvents.deleteTerminalBefore(new Date(now.getTime() - WEBHOOK_RETENTION_MS));
			const states = await deps.oauthStates.deleteExpiredBefore(new Date(now.getTime() - STATE_RETENTION_MS));
			deps.logger.info({ events, states }, 'maintenance retention swept');
			return;
		}
	}
}

async function refreshExpiringCredentials(deps: MaintenanceProcessorDeps, now: Date): Promise<void> {
	const expiring = await deps.credentials.listExpiringBefore(new Date(now.getTime() + REFRESH_MARGIN_MS));
	const integrationIds = [...new Set(expiring.filter((c) => !LAZY_KINDS.has(c.kind)).map((c) => c.integrationId))];

	for (const integrationId of integrationIds) {
		const integration = await deps.integrations.findById(integrationId);
		if (!integration || integration.status !== 'active') continue;
		const provider = deps.registry.find(integration.provider);
		if (!provider || !supportsOAuth(provider) || !provider.refreshCredentials) continue;

		try {
			const refreshed = await provider.refreshCredentials({ integration, vault: deps.vault.forIntegration(integration.id) });
			if (refreshed) {
				for (const credential of refreshed.credentials) {
					await deps.vault.put(integration.id, credential.kind, credential.value, credential.expiresAt ?? null);
				}
				deps.logger.info({ integrationId: integration.id, provider: integration.provider }, 'rotated expiring credentials');
			}
		} catch (err) {
			// A dead refresh token needs the user, not a retry loop.
			await deps.integrations.updateHealth(integration.id, 'needs_reauthorization', { error: (err as Error).message });
			await deps.bus.publish({
				kind: 'health.changed',
				provider: integration.provider,
				integrationId: integration.id,
				orgId: integration.orgId,
				health: 'needs_reauthorization',
			});
			deps.logger.warn({ integrationId: integration.id, err: (err as Error).message }, 'credential refresh failed');
		}
	}
}

async function sweepHealth(deps: MaintenanceProcessorDeps): Promise<void> {
	for (const provider of deps.registry.list()) {
		if (!supportsHealthCheck(provider)) continue;
		for (const integration of await deps.integrations.listActiveByProvider(provider.manifest.id)) {
			const report = await provider
				.checkHealth({ integration, vault: deps.vault.forIntegration(integration.id) })
				.catch((err: Error) => ({ health: 'unknown' as const, detail: { error: err.message } }));
			if (report.health === integration.health) continue;
			await deps.integrations.updateHealth(integration.id, report.health, report.detail);
			await deps.bus.publish({
				kind: 'health.changed',
				provider: integration.provider,
				integrationId: integration.id,
				orgId: integration.orgId,
				health: report.health,
				detail: report.detail,
			});
		}
	}
}

async function reconcileSyncs(deps: MaintenanceProcessorDeps, now: Date): Promise<void> {
	const stale = await deps.connectors.listEventTriggeredStale(new Date(now.getTime() - STALE_AFTER_MS));
	const due = await deps.connectors.listIntervalDue(now);
	const seen = new Set<string>();
	for (const connector of [...stale, ...due]) {
		if (seen.has(connector.id)) continue;
		seen.add(connector.id);
		await enqueueIncrementalSync(deps, connector);
	}
	if (seen.size > 0) deps.logger.info({ connectors: seen.size }, 'reconcile syncs scheduled');
}

async function enqueueIncrementalSync(deps: MaintenanceProcessorDeps, connector: KnowledgeConnector): Promise<void> {
	const { job, created } = await deps.pipelineJobs.createDeduped({
		id: randomUUID(),
		projectId: connector.projectId,
		jobType: 'source_sync',
		payload: { connectorId: connector.id, mode: 'incremental', reason: 'reconcile' },
		dedupeKey: `source_sync:${connector.id}:incremental`,
	});
	if (!created) return;
	await deps.sourceSyncQueue.add(
		'sync',
		{ pipelineJobId: job.id, connectorId: connector.id, projectId: connector.projectId, mode: 'incremental' },
		{ jobId: job.id }
	);
}
