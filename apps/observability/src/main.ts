import pg from 'pg';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import { PostgresPipelineRunRepository } from '@meshify/data-access';
import { RocketRideClientPool } from '@meshify/rocketride-gateway';
import { DapEventHandler } from './dap-event-handler.js';

// One long-lived DAP subscriber for the whole platform. Runs as a SINGLE
// instance: unlike the queue workers it holds one WebSocket subscription and
// must not be horizontally scaled without leader election, or every replica
// would double-write events. Upserts are keyed by run_key so a brief overlap
// during a restart is harmless, but steady-state duplication is not.
async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'observability' });

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const runs = new PostgresPipelineRunRepository(pgPool);
	const handler = new DapEventHandler(runs, logger);

	const pool = new RocketRideClientPool(env, logger, (event) => handler.handle(event));

	await pool.getClient();
	await pool.subscribeAllTasks(['task', 'summary', 'flow', 'output', 'sse']);
	logger.info({}, 'observability ingester subscribed to all tasks');

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		await pool.shutdown();
		await pgPool.end();
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
	console.error('Fatal error during observability bootstrap:', err);
	process.exit(1);
});
