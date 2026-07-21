import '@meshify/telemetry'; // MUST be first — instruments http/express/pg before they load
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Redis } from 'ioredis';
import { Worker } from 'bullmq';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import {
	PostgresDocumentRepository,
	PostgresFileRepository,
	PostgresKnowledgeConnectorRepository,
	PostgresPipelineJobRepository,
	PostgresProjectRepository,
	PostgresRepositoryRepository,
	PostgresSlackChannelRepository,
	PostgresSlackConversationRepository,
	PostgresSlackSyncStateRepository,
	PostgresSlackWorkspaceRepository,
	PostgresIntegrationRepository,
	PostgresIntegrationCredentialRepository,
	PostgresIntegrationResourceRepository,
	PostgresSyncCursorRepository,
	PostgresWebhookEventRepository,
	PostgresOAuthStateRepository,
	PostgresProviderRegistrationRepository,
	PostgresProviderRegistrationCredentialRepository,
	encryptSecret,
	decryptSecret,
} from '@meshify/data-access';
import { ObjectStorageClient } from '@meshify/object-storage';
import {
	DOCUMENT_INGEST_QUEUE,
	REPO_INGEST_QUEUE,
	REPO_SYNC_QUEUE,
	SLACK_INGEST_QUEUE,
	SLACK_SYNC_QUEUE,
	SOURCE_SYNC_QUEUE,
	WEBHOOK_EVENTS_QUEUE,
	INTEGRATION_MAINTENANCE_QUEUE,
	MAINTENANCE_SCHEDULES,
	createIntegrationMaintenanceQueue,
	createSourceSyncQueue,
	createWebhookEventsQueue,
	JobEventPublisher,
	type DocumentIngestJobPayload,
	type RepoIngestJobPayload,
	type RepoSyncJobPayload,
	type SlackIngestJobPayload,
	type SlackSyncJobPayload,
	type SourceSyncJobPayload,
	type WebhookEventJobPayload,
	type IntegrationMaintenanceJobPayload,
} from '@meshify/queues';
import { GitHubAppAuth, GitHubRepoClient } from '@meshify/github';
import { HttpSlackClient } from '@meshify/slack';
import { QdrantSearchClient } from '@meshify/vector-store';
import { PipelineRegistry, RocketRideClientPool, RocketRideRagService } from '@meshify/rocketride-gateway';
import { startMetricsServer } from './observability/metrics-server.js';
import { processDocumentIngestJob } from './processors/document-ingest.processor.js';
import { processRepoIngestJob } from './processors/repo-ingest.processor.js';
import { processRepoSyncJob } from './processors/repo-sync.processor.js';
import { processSlackIngestJob } from './processors/slack-ingest.processor.js';
import { processSlackSyncJob } from './processors/slack-sync.processor.js';
import type { SlackIngestionDeps } from './slack/ingest-workspace.js';
import {
	CredentialVault,
	ProviderNotConfiguredError,
	ProviderRegistry,
	ProviderRegistrationService,
	RedisPlatformEventBus,
	buildManagedRegistrations,
	createGitHubProvider,
	createGitHubTransport,
	createSlackProvider,
	createSlackTransport,
	type ContentLedger,
} from '@meshify/providers';
import type { KnowledgeConnector } from '@meshify/data-access';
import { processSourceSyncJob } from './processors/source-sync.processor.js';
import { processWebhookEventJob } from './processors/webhook-event.processor.js';
import { processMaintenanceJob } from './processors/integration-maintenance.processor.js';
import { ProjectKnowledgeWriter } from './processors/knowledge-writer.js';
import { createGitHubContentLedger, createSlackContentLedger } from './processors/content-ledgers.js';

const DOCUMENT_CHUNK_SIZE = 768; // prose default per ROCKETRIDE_PIPELINE_RULES.md (512-1024 chars)
const CODE_CHUNK_SIZE = 384; // code default per ROCKETRIDE_PIPELINE_RULES.md (256-512 chars)



async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'worker' });

	// A managed (non-local) Qdrant requires an API key; without it the ingest
	// pipeline's Qdrant target is built with no auth, RocketRide can't write vectors,
	// and the pipeline task WEDGES (surfacing only as a "pipeline restart did not
	// respond" timeout). Warn loudly at boot so that failure mode is diagnosable.
	{
		const qdrantHostname = new URL(env.QDRANT_URL).hostname;
		const isLocalQdrant = ['localhost', '127.0.0.1', '::1'].includes(qdrantHostname) || qdrantHostname.endsWith('.railway.internal');
		if (!isLocalQdrant && !env.QDRANT_API_KEY) {
			logger.warn({ qdrantHostname }, 'QDRANT_API_KEY is not set but QDRANT_URL is a managed host — ingest pipelines will fail to write to Qdrant Cloud (the RocketRide task will wedge). Set QDRANT_API_KEY.');
		}
	}

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const bullRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
	// Publishes real-time job progress to Redis Pub/Sub (PUBLISH works on a normal connection, so bullRedis is reused).
	const jobEvents = new JobEventPublisher(bullRedis);

	const projects = new PostgresProjectRepository(pgPool);
	const documents = new PostgresDocumentRepository(pgPool);
	const repositories = new PostgresRepositoryRepository(pgPool);
	const files = new PostgresFileRepository(pgPool);
	const pipelineJobs = new PostgresPipelineJobRepository(pgPool);
	const connectors = new PostgresKnowledgeConnectorRepository(pgPool);
	const slackWorkspaces = new PostgresSlackWorkspaceRepository(pgPool);
	const slackChannels = new PostgresSlackChannelRepository(pgPool);
	const slackConversations = new PostgresSlackConversationRepository(pgPool);
	const slackSyncState = new PostgresSlackSyncStateRepository(pgPool);
	const storage = new ObjectStorageClient({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		bucket: env.S3_BUCKET,
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
	});

	const clientPool = new RocketRideClientPool(env, logger);
	const pipelineRegistry = new PipelineRegistry(clientPool);
	const rag = new RocketRideRagService(clientPool);
	// GITHUB_APP_* is optional (slack/docs-only deployments boot without it);
	// repo jobs on an unconfigured deployment fail with a clear message instead
	// of the process refusing to start.
	class UnconfiguredGitHubAppAuth extends GitHubAppAuth {
		constructor() {
			super({ appId: 'unconfigured', privateKey: 'unconfigured' });
		}
		override appJwt(): string {
			throw new Error('GitHub App is not configured — set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY');
		}
		override async installationToken(): Promise<string> {
			throw new Error('GitHub App is not configured — set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY');
		}
	}
	const githubConfigured = Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
	if (!githubConfigured) logger.warn('GITHUB_APP_* not set — repository ingestion/sync jobs will fail until configured');
	const github = new GitHubRepoClient(
		githubConfigured
			? new GitHubAppAuth({ appId: env.GITHUB_APP_ID!, privateKey: env.GITHUB_APP_PRIVATE_KEY! })
			: new UnconfiguredGitHubAppAuth()
	);
	const slackClient = new HttpSlackClient();
	const qdrantSearchClient = new QdrantSearchClient(env.QDRANT_URL, env.QDRANT_API_KEY);

	const qdrantUrl = new URL(env.QDRANT_URL);
	const qdrantHost = qdrantUrl.hostname;
	const qdrantPort = Number(qdrantUrl.port || 6333);
	const qdrantApiKey = env.QDRANT_API_KEY;

	// Shared dependencies for both Slack processors (full ingest + incremental sync).
	const slackDeps: SlackIngestionDeps = {
		connectors,
		pipelineJobs,
		slackWorkspaces,
		slackChannels,
		slackConversations,
		slackSyncState,
		projects,
		slack: slackClient,
		rag,
		vectors: qdrantSearchClient,
		jobEvents,
		pipelineRegistry,
		documentChunkSize: DOCUMENT_CHUNK_SIZE,
		qdrantHost,
		qdrantPort,
		qdrantApiKey,
		encryptionKey: env.ORG_KEY_ENCRYPTION_KEY,
	};

	// --- Provider platform: registry + vault + generic source-sync ----------
	const integrations = new PostgresIntegrationRepository(pgPool);
	const integrationCredentials = new PostgresIntegrationCredentialRepository(pgPool);
	const syncCursors = new PostgresSyncCursorRepository(pgPool);
	const integrationKey = env.INTEGRATION_ENCRYPTION_KEY ?? env.ORG_KEY_ENCRYPTION_KEY;
	const requireIntegrationKey = (): string => {
		if (!integrationKey) throw new ProviderNotConfiguredError('platform', 'Set INTEGRATION_ENCRYPTION_KEY (or ORG_KEY_ENCRYPTION_KEY) to run provider syncs');
		return integrationKey;
	};
	const credentialVault = new CredentialVault(integrationCredentials, {
		encrypt: (plaintext) => encryptSecret(requireIntegrationKey(), plaintext),
		decrypt: (ciphertext) => decryptSecret(requireIntegrationKey(), ciphertext),
	});

	// The Provider Registration layer: every org has a virtual managed
	// registration from deployment env; BYOA registrations (DB) override it.
	const managedRegistrations = buildManagedRegistrations(env);
	const registrationVault = new CredentialVault(new PostgresProviderRegistrationCredentialRepository(pgPool), {
		encrypt: (plaintext) => encryptSecret(requireIntegrationKey(), plaintext),
		decrypt: (ciphertext) => decryptSecret(requireIntegrationKey(), ciphertext),
	});
	const registrationService = new ProviderRegistrationService(new PostgresProviderRegistrationRepository(pgPool), registrationVault, managedRegistrations);

	// The repo transport closes over the provider instance (declared below) so
	// sync fetches ride the vault-cached installation token, not per-repo discovery.
	const githubProvider = createGitHubProvider({
		transportFactory: createGitHubTransport,
		sync: {
			repos: repositories,
			files,
			repoTransport: (ctx) => new GitHubRepoClient({ installationToken: () => githubProvider.getInstallationToken(ctx) }),
			generateId: () => randomUUID(),
		},
	});
	const slackProvider = createSlackProvider({
		transportFactory: createSlackTransport,
		sync: {
			workspaces: slackWorkspaces,
			channels: slackChannels,
			conversations: slackConversations,
			syncState: slackSyncState,
			client: slackClient,
			generateId: () => randomUUID(),
		},
	});
	const providerRegistry = new ProviderRegistry();
	providerRegistry.register(githubProvider);
	providerRegistry.register(slackProvider);

	const ledgers = new Map<string, (connector: KnowledgeConnector) => ContentLedger>([
		['github', createGitHubContentLedger({ repositories, files })],
		['slack', createSlackContentLedger({ conversations: slackConversations })],
	]);

	const platformEventBus = new RedisPlatformEventBus(bullRedis);
	const sourceSyncDeps = {
		registry: providerRegistry,
		connectors,
		integrations,
		projects,
		pipelineJobs,
		syncCursors,
		vault: credentialVault,
		registrations: registrationService,
		jobEvents,
		bus: platformEventBus,
		logger,
		ledgers,
		writerFor: async (projectId: string) => {
			const project = await projects.findById(projectId);
			if (!project) throw new Error(`Project "${projectId}" not found`);
			return new ProjectKnowledgeWriter(
				project,
				rag,
				qdrantSearchClient,
				{ pipelineRegistry, qdrantHost, qdrantPort, qdrantApiKey },
				{ documents: DOCUMENT_CHUNK_SIZE, code: CODE_CHUNK_SIZE }
			);
		},
	};

	// Webhook dispatch: normalize recorded deliveries into platform events,
	// schedule dedupe-keyed syncs (durable, retried), publish for live consumers.
	const webhookEventRepository = new PostgresWebhookEventRepository(pgPool);
	const integrationResources = new PostgresIntegrationResourceRepository(pgPool);
	const sourceSyncQueue = createSourceSyncQueue(bullRedis);
	const webhookDeps = {
		registry: providerRegistry,
		webhookEvents: webhookEventRepository,
		integrations,
		connectors,
		resources: integrationResources,
		repositories,
		pipelineJobs,
		sourceSyncQueue,
		vault: credentialVault,
		registrations: registrationService,
		bus: platformEventBus,
	};

	// Platform upkeep: BullMQ Job Schedulers drive the recurring sweeps; the
	// scheduler upsert is idempotent across worker replicas and restarts.
	const maintenanceQueue = createIntegrationMaintenanceQueue(bullRedis);
	for (const schedule of MAINTENANCE_SCHEDULES) {
		await maintenanceQueue.upsertJobScheduler(`maintenance-${schedule.task}`, { every: schedule.everyMs }, {
			name: schedule.task,
			data: { task: schedule.task },
		});
	}
	const maintenanceDeps = {
		registry: providerRegistry,
		integrations,
		credentials: integrationCredentials,
		connectors,
		pipelineJobs,
		oauthStates: new PostgresOAuthStateRepository(pgPool),
		webhookEvents: webhookEventRepository,
		sourceSyncQueue,
		webhookQueue: createWebhookEventsQueue(bullRedis),
		vault: credentialVault,
		registrations: registrationService,
		bus: platformEventBus,
		logger,
	};

	const documentWorker = new Worker<DocumentIngestJobPayload>(
		DOCUMENT_INGEST_QUEUE,
		(job) =>
			processDocumentIngestJob(job, {
				documents,
				projects,
				pipelineJobs,
				storage,
				pipelineRegistry,
				rag,
				jobEvents,
				documentChunkSize: DOCUMENT_CHUNK_SIZE,
				qdrantHost,
				qdrantPort,
				qdrantApiKey,
			}),
		{ connection: bullRedis, concurrency: 5 }
	);

	const repoIngestWorker = new Worker<RepoIngestJobPayload>(
		REPO_INGEST_QUEUE,
		(job) =>
			processRepoIngestJob(job, {
				repositories,
				files,
				projects,
				pipelineJobs,
				storage,
				github,
				pipelineRegistry,
				rag,
				jobEvents,
				codeChunkSize: CODE_CHUNK_SIZE,
				qdrantHost,
				qdrantPort,
				qdrantApiKey,
			}),
		// Repo ingestion is archive-sized work (extraction + full-tree embedding); keep concurrency low.
		{ connection: bullRedis, concurrency: 2 }
	);

	const repoSyncWorker = new Worker<RepoSyncJobPayload>(
		REPO_SYNC_QUEUE,
		(job) =>
			processRepoSyncJob(job, {
				repositories,
				files,
				projects,
				pipelineJobs,
				github,
				pipelineRegistry,
				rag,
				jobEvents,
				codeChunkSize: CODE_CHUNK_SIZE,
				qdrantHost,
				qdrantPort,
				qdrantApiKey,
			}),
		{ connection: bullRedis, concurrency: 3 }
	);

	// Slack ingest/sync are Slack-API-bound (paginated history + per-user lookups); keep concurrency low.
	const slackIngestWorker = new Worker<SlackIngestJobPayload>(SLACK_INGEST_QUEUE, (job) => processSlackIngestJob(job, slackDeps), { connection: bullRedis, concurrency: 2 });
	const slackSyncWorker = new Worker<SlackSyncJobPayload>(SLACK_SYNC_QUEUE, (job) => processSlackSyncJob(job, slackDeps), { connection: bullRedis, concurrency: 2 });

	// The provider platform's generic sync lane; legacy per-provider workers
	// above remain only to drain in-flight jobs enqueued before the cutover.
	const sourceSyncWorker = new Worker<SourceSyncJobPayload>(SOURCE_SYNC_QUEUE, (job) => processSourceSyncJob(job, sourceSyncDeps), { connection: bullRedis, concurrency: 3 });
	const webhookEventsWorker = new Worker<WebhookEventJobPayload>(WEBHOOK_EVENTS_QUEUE, (job) => processWebhookEventJob(job, webhookDeps), { connection: bullRedis, concurrency: 5 });
	const maintenanceWorker = new Worker<IntegrationMaintenanceJobPayload>(INTEGRATION_MAINTENANCE_QUEUE, (job) => processMaintenanceJob(job, maintenanceDeps), { connection: bullRedis, concurrency: 1 });

	const workers = [documentWorker, repoIngestWorker, repoSyncWorker, slackIngestWorker, slackSyncWorker, sourceSyncWorker, webhookEventsWorker, maintenanceWorker];
	for (const worker of workers) {
		worker.on('completed', (job) => logger.info({ queue: worker.name, jobId: job.id }, 'job completed'));
		worker.on('failed', (job, err) => logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, 'job failed'));
	}

	logger.info({ queues: workers.map((w) => w.name) }, 'worker listening');

	// Metrics/health HTTP surface (queue depth + process metrics).
	const metricsServer = startMetricsServer({
		port: env.WORKER_METRICS_PORT,
		token: env.METRICS_TOKEN,
		connection: bullRedis,
		queueNames: workers.map((w) => w.name),
	});
	logger.info({ port: env.WORKER_METRICS_PORT }, 'worker metrics listening');

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		await metricsServer.close();
		await Promise.all(workers.map((w) => w.close()));
		await sourceSyncQueue.close();
		await maintenanceQueue.close();
		await clientPool.shutdown();
		await bullRedis.quit();
		await pgPool.end();
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
	console.error('Fatal error during worker bootstrap:', err);
	process.exit(1);
});