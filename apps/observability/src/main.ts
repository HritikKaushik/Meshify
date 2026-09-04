import { loadEnv } from '@meshify/config';
import { createLogger, installGracefulShutdown, installProcessGuards } from '@meshify/shared';
import { PostgresPipelineRunRepository, createPgPool } from '@meshify/data-access';
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
	installProcessGuards(logger);

	// Block until we're the leader — standbys wait here without subscribing.
	await acquireLeadership(env.DATABASE_URL, logger);

	const pgPool = createPgPool({ connectionString: env.DATABASE_URL, max: env.PG_POOL_MAX, statementTimeoutMs: env.PG_STATEMENT_TIMEOUT_MS, applicationName: 'observability' }, logger);
	const runs = new PostgresPipelineRunRepository(pgPool);
	const handler = new DapEventHandler(runs, logger);

	const pool = new RocketRideClientPool(env, logger, (event) => handler.handle(event));

	await pool.getClient();
	await pool.subscribeAllTasks(['task', 'summary', 'flow', 'output', 'sse']);
	logger.info({}, 'observability ingester subscribed to all tasks');

	installGracefulShutdown({
		logger,
		timeoutMs: 20_000,
		steps: [
			{ name: 'rocketride subscription', run: () => pool.shutdown() },
			{ name: 'postgres', run: () => pgPool.end() },
		],
	});
}

bootstrap().catch((err) => {
	console.error('Fatal error during observability bootstrap:', err);
	process.exit(1);
});
