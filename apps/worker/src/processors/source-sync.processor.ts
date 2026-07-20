import type { Job } from 'bullmq';
import type {
	IntegrationRepository,
	KnowledgeConnector,
	KnowledgeConnectorRepository,
	PipelineJobRepository,
	ProjectRepository,
	SyncCursorRepository,
} from '@meshify/data-access';
import type { JobEventPublisher, SourceSyncJobPayload } from '@meshify/queues';
import type { ContentLedger, CredentialVault, CursorStore, KnowledgeWriter, PlatformEventBus, ProviderRegistrationService, ProviderRegistry, SyncContext } from '@meshify/providers';
import { ConnectorEngine, supportsSync } from '@meshify/providers';
import { JobProgress } from './job-progress.js';
import { runPipelineJob } from './run-pipeline-job.js';

export interface SourceSyncProcessorDeps {
	registry: ProviderRegistry;
	connectors: KnowledgeConnectorRepository;
	integrations: IntegrationRepository;
	projects: ProjectRepository;
	pipelineJobs: PipelineJobRepository;
	syncCursors: SyncCursorRepository;
	vault: CredentialVault;
	registrations: ProviderRegistrationService;
	jobEvents: JobEventPublisher;
	/** Org-scoped sync lifecycle events (sync.completed / sync.failed) for the integrations SSE stream. */
	bus: PlatformEventBus;
	logger: { error: (obj: unknown, msg: string) => void };
	/** Per-provider ContentLedger factories (worker composition data, not code branching). */
	ledgers: Map<string, (connector: KnowledgeConnector) => ContentLedger>;
	/** Per-job writer construction (project-scoped pipeline tokens). */
	writerFor(projectId: string): Promise<KnowledgeWriter>;
}

/**
 * The generic provider-platform sync processor: one processor for every
 * provider. Resolves the provider from the registry, assembles the SyncContext
 * (vault-scoped credentials, generic cursor store), and lets the
 * ConnectorEngine drive the provider's executeSync — job lifecycle, progress,
 * and connector status handled uniformly here.
 */
export async function processSourceSyncJob(job: Job<SourceSyncJobPayload>, deps: SourceSyncProcessorDeps): Promise<void> {
	const { pipelineJobId, connectorId, projectId, mode } = job.data;
	const progress = new JobProgress(deps.pipelineJobs, deps.jobEvents, {
		jobId: pipelineJobId,
		projectId,
		jobType: 'source_sync',
		title: 'Source sync',
	});

	await runPipelineJob(
		job,
		pipelineJobId,
		deps.pipelineJobs,
		async () => {
			const connector = await deps.connectors.findById(connectorId);
			if (!connector) throw new Error(`Connector "${connectorId}" not found`);
			if (!connector.integrationId) throw new Error(`Connector "${connectorId}" has no integration — it must sync through its legacy queue`);

			const [integration, project] = await Promise.all([
				deps.integrations.findById(connector.integrationId),
				deps.projects.findById(projectId),
			]);
			if (!integration) throw new Error(`Integration "${connector.integrationId}" not found`);
			if (!project) throw new Error(`Project "${projectId}" not found`);

			const provider = deps.registry.get(connector.type);
			if (!supportsSync(provider)) throw new Error(`Provider "${connector.type}" does not support content sync`);

			progress.setTitle(`${connector.displayName} · ${provider.manifest.displayName}`);

			const ledgerFactory = deps.ledgers.get(connector.type);
			if (!ledgerFactory) throw new Error(`No content ledger is wired for provider "${connector.type}"`);

			const cursors: CursorStore = {
				get: async (scopeKey) => (await deps.syncCursors.get(connector.id, scopeKey))?.cursor,
				set: async (scopeKey, cursor) => void (await deps.syncCursors.upsert(connector.id, scopeKey, cursor)),
			};

			const registration = await deps.registrations.resolveForIntegration(integration);
			if (!registration) throw new Error(`No provider registration resolves for ${integration.provider} (org ${integration.orgId})`);
			const ctx: SyncContext = { mode, integration, connector, vault: deps.vault.forIntegration(integration.id), registration, cursors };
			const writer = await deps.writerFor(projectId);
			const engine = new ConnectorEngine(writer, ledgerFactory(connector));

			const summary = await engine.execute(provider, ctx, (stage, percent) => void progress.stage(stage, percent ?? 0));

			const warning =
				summary.partialFailures.length > 0
					? `Skipped ${summary.partialFailures.length} scope(s): ${summary.partialFailures.map((f) => `${f.scope}: ${f.error}`).join('; ')}`
					: null;
			await deps.connectors.updateStatus(connectorId, 'active', warning);
			await deps.bus.publish({
				kind: 'sync.completed',
				provider: connector.type,
				integrationId: integration.id,
				orgId: integration.orgId,
				connectorId,
				projectId,
				itemsUpserted: summary.itemsUpserted,
				itemsRemoved: summary.itemsRemoved,
			});
		},
		async (message) => {
			await deps.connectors.updateStatus(connectorId, 'error', message);
			// Diagnostic context on the single generic sync lane's failures.
			deps.logger.error({ connectorId, projectId, mode, error: message }, 'source sync failed');
			// Best-effort org-level sync.failed for the integrations SSE stream.
			const connector = await deps.connectors.findById(connectorId).catch(() => undefined);
			const integration = connector?.integrationId ? await deps.integrations.findById(connector.integrationId).catch(() => undefined) : undefined;
			if (connector && integration) {
				await deps.bus
					.publish({ kind: 'sync.failed', provider: connector.type, integrationId: integration.id, orgId: integration.orgId, connectorId, projectId, error: message })
					.catch(() => undefined);
			}
		},
		progress
	);
}
