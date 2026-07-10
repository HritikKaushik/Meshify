import pg from 'pg';
import { Redis } from 'ioredis';
import { Worker } from 'bullmq';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import { PostgresDocumentRepository, PostgresPipelineJobRepository, PostgresProjectRepository } from '@meshify/data-access';
import { ObjectStorageClient } from '@meshify/object-storage';
import { DOCUMENT_INGEST_QUEUE, type DocumentIngestJobPayload } from '@meshify/queues';
import { PipelineRegistry, RocketRideClientPool, RocketRideRagService } from '@meshify/rocketride-gateway';
import { processDocumentIngestJob } from './processors/document-ingest.processor.js';

const DOCUMENT_CHUNK_SIZE = 768; // prose default per ROCKETRIDE_PIPELINE_RULES.md chunk-sizing guidance (512-1024 chars)

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'worker' });

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const bullRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

	const projects = new PostgresProjectRepository(pgPool);
	const documents = new PostgresDocumentRepository(pgPool);
	const pipelineJobs = new PostgresPipelineJobRepository(pgPool);
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

	const qdrantUrl = new URL(env.QDRANT_URL);

	const worker = new Worker<DocumentIngestJobPayload>(
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
				qdrantHost: qdrantUrl.hostname,
				qdrantPort: Number(qdrantUrl.port || 6333),
			}),
		{ connection: bullRedis, concurrency: 5 }
	);

	worker.on('completed', (job) => logger.info({ jobId: job.id, documentId: job.data.documentId }, 'document ingested'));
	worker.on('failed', (job, err) => logger.error({ jobId: job?.id, documentId: job?.data.documentId, err: err.message }, 'document ingest failed'));

	logger.info({ queue: DOCUMENT_INGEST_QUEUE, concurrency: 5 }, 'worker listening');

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		await worker.close();
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
