import pg from 'pg';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import { PostgresPipelineRunRepository } from '@meshify/data-access';
import { RocketRideClientPool } from '@meshify/rocketride-gateway';
import { DapEventHandler } from './dap-event-handler.js';
import { acquireLeadership } from './leader-election.js';

// One long-lived DAP subscriber for the whole platform. It holds a single
// WebSocket subscription and writes pipeline_runs, so exactly one replica may be
// ACTIVE at a time — enforced by a Postgres advisory lock (leader election).
// Extra replicas block as hot standbys and take over if the leader dies; a brief
// overlap during handover is harmless (upserts are keyed by run_key). This makes
// rolling restarts / a standby replica safe.
async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'observability' });

	// Block until we're the leader — standbys wait here without subscribing.
	await acquireLeadership(env.DATABASE_URL, logger);

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
