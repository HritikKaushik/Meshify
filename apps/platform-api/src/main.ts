import express from 'express';
import { pinoHttp } from 'pino-http';
import pg from 'pg';
import { Redis } from 'ioredis';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import { PostgresChecker } from './modules/health/infrastructure/postgres.checker.js';
import { RedisChecker } from './modules/health/infrastructure/redis.checker.js';
import { QdrantChecker } from './modules/health/infrastructure/qdrant.checker.js';
import { CheckHealthUseCase } from './modules/health/application/check-health.usecase.js';
import { createHealthController } from './modules/health/interface/health.controller.js';
import { PostgresProjectRepository } from '@meshify/data-access';
import { QdrantCollectionProvisioner } from '@meshify/vector-store';
import { CreateProjectUseCase } from './modules/projects/application/create-project.usecase.js';
import { DeleteProjectUseCase } from './modules/projects/application/delete-project.usecase.js';
import { GetProjectUseCase } from './modules/projects/application/get-project.usecase.js';
import { createProjectsController } from './modules/projects/interface/projects.controller.js';
import { PostgresDocumentRepository, PostgresPipelineJobRepository } from '@meshify/data-access';
import { ObjectStorageClient } from '@meshify/object-storage';
import { createDocumentIngestQueue } from '@meshify/queues';
import { UploadDocumentUseCase } from './modules/documents/application/upload-document.usecase.js';
import { GetJobStatusUseCase } from './modules/documents/application/get-job-status.usecase.js';
import { createDocumentsController } from './modules/documents/interface/documents.controller.js';

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'platform-api' });

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
	await redis.connect();

	// BullMQ requires its own connection with maxRetriesPerRequest: null — cannot share the health-check client above.
	const bullRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

	const checkHealth = new CheckHealthUseCase([
		new PostgresChecker(pgPool),
		new RedisChecker(redis),
		new QdrantChecker(env.QDRANT_URL, env.QDRANT_API_KEY),
	]);

	const projectRepository = new PostgresProjectRepository(pgPool);
	const qdrantProvisioner = new QdrantCollectionProvisioner(env.QDRANT_URL, env.QDRANT_API_KEY);
	const createProject = new CreateProjectUseCase(projectRepository, qdrantProvisioner);
	const deleteProject = new DeleteProjectUseCase(projectRepository, qdrantProvisioner);
	const getProject = new GetProjectUseCase(projectRepository);

	const documentRepository = new PostgresDocumentRepository(pgPool);
	const pipelineJobRepository = new PostgresPipelineJobRepository(pgPool);
	const objectStorage = new ObjectStorageClient({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		bucket: env.S3_BUCKET,
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
	});
	const ingestQueue = createDocumentIngestQueue(bullRedis);
	const uploadDocument = new UploadDocumentUseCase(documentRepository, pipelineJobRepository, objectStorage, ingestQueue);
	const getJobStatus = new GetJobStatusUseCase(pipelineJobRepository);

	const app = express();
	app.use(pinoHttp({ logger }));
	app.use(express.json());
	app.use(createHealthController(checkHealth));
	app.use(createProjectsController({ createProject, deleteProject, getProject }));
	app.use(createDocumentsController({ getProject, uploadDocument, getJobStatus }));

	const server = app.listen(env.PLATFORM_PORT, () => {
		logger.info({ port: env.PLATFORM_PORT }, 'platform-api listening');
	});

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		server.close();
		await ingestQueue.close();
		await redis.quit();
		await bullRedis.quit();
		await pgPool.end();
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
	console.error('Fatal error during bootstrap:', err);
	process.exit(1);
});
