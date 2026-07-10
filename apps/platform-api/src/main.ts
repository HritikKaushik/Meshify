import express from 'express';
import { pinoHttp } from 'pino-http';
import pg from 'pg';
import { Redis } from 'ioredis';
import { loadEnv } from '@meshify/config';
import { createLogger } from './shared-kernel/logger.js';
import { PostgresChecker } from './modules/health/infrastructure/postgres.checker.js';
import { RedisChecker } from './modules/health/infrastructure/redis.checker.js';
import { QdrantChecker } from './modules/health/infrastructure/qdrant.checker.js';
import { CheckHealthUseCase } from './modules/health/application/check-health.usecase.js';
import { createHealthController } from './modules/health/interface/health.controller.js';
import { PostgresProjectRepository } from './modules/projects/infrastructure/postgres-project.repository.js';
import { QdrantCollectionProvisioner } from './modules/projects/infrastructure/qdrant-collection.provisioner.js';
import { CreateProjectUseCase } from './modules/projects/application/create-project.usecase.js';
import { DeleteProjectUseCase } from './modules/projects/application/delete-project.usecase.js';
import { GetProjectUseCase } from './modules/projects/application/get-project.usecase.js';
import { createProjectsController } from './modules/projects/interface/projects.controller.js';

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger(env);

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
	await redis.connect();

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

	const app = express();
	app.use(pinoHttp({ logger }));
	app.use(express.json());
	app.use(createHealthController(checkHealth));
	app.use(createProjectsController({ createProject, deleteProject, getProject }));

	const server = app.listen(env.PLATFORM_PORT, () => {
		logger.info({ port: env.PLATFORM_PORT }, 'platform-api listening');
	});

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		server.close();
		await redis.quit();
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
