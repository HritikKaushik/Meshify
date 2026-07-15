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
} from '@meshify/data-access';
import { ObjectStorageClient } from '@meshify/object-storage';
import {
	DOCUMENT_INGEST_QUEUE,
	REPO_INGEST_QUEUE,
	REPO_SYNC_QUEUE,
	SLACK_INGEST_QUEUE,
	SLACK_SYNC_QUEUE,
	type DocumentIngestJobPayload,
	type RepoIngestJobPayload,
	type RepoSyncJobPayload,
	type SlackIngestJobPayload,
	type SlackSyncJobPayload,
} from '@meshify/queues';
import { GitHubAppAuth, GitHubRepoClient } from '@meshify/github';
import { HttpSlackClient } from '@meshify/slack';
import { QdrantSearchClient } from '@meshify/vector-store';
import { PipelineRegistry, RocketRideClientPool, RocketRideRagService } from '@meshify/rocketride-gateway';
import { processDocumentIngestJob } from './processors/document-ingest.processor.js';
import { processRepoIngestJob } from './processors/repo-ingest.processor.js';
import { processRepoSyncJob } from './processors/repo-sync.processor.js';
import { processSlackIngestJob } from './processors/slack-ingest.processor.js';
import { processSlackSyncJob } from './processors/slack-sync.processor.js';
import type { SlackIngestionDeps } from './slack/ingest-workspace.js';

const DOCUMENT_CHUNK_SIZE = 768; // prose default per ROCKETRIDE_PIPELINE_RULES.md (512-1024 chars)
const CODE_CHUNK_SIZE = 384; // code default per ROCKETRIDE_PIPELINE_RULES.md (256-512 chars)

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'worker' });

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const bullRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

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
	const github = new GitHubRepoClient(new GitHubAppAuth({ appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY }));
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
		pipelineRegistry,
		documentChunkSize: DOCUMENT_CHUNK_SIZE,
		qdrantHost,
		qdrantPort,
		qdrantApiKey,
		encryptionKey: env.ORG_KEY_ENCRYPTION_KEY,
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

	const workers = [documentWorker, repoIngestWorker, repoSyncWorker, slackIngestWorker, slackSyncWorker];
	for (const worker of workers) {
		worker.on('completed', (job) => logger.info({ queue: worker.name, jobId: job.id }, 'job completed'));
		worker.on('failed', (job, err) => logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, 'job failed'));
	}

	logger.info({ queues: workers.map((w) => w.name) }, 'worker listening');

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		await Promise.all(workers.map((w) => w.close()));
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
