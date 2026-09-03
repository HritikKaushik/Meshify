import pg from 'pg';

export interface PgPoolSettings {
	connectionString: string;
	/** Upper bound on open connections from this process (Render's starter Postgres allows ~97 in total across every service). */
	max: number;
	/** Server-side statement_timeout for every connection; a runaway query is cancelled instead of pinning a connection. */
	statementTimeoutMs: number;
	/** Shown in pg_stat_activity, so a saturated database can be traced to the service holding the connections. */
	applicationName: string;
}

interface PoolLogger {
	error(obj: Record<string, unknown>, msg: string): void;
}

/** The pg.Pool configuration for a service; pure, so it can be asserted on. */
export function pgPoolOptions(settings: PgPoolSettings): pg.PoolConfig {
	return {
		connectionString: settings.connectionString,
		max: settings.max,
		application_name: settings.applicationName,
		statement_timeout: settings.statementTimeoutMs,
		// Fail a checkout that cannot get a connection instead of queueing forever
		// behind a saturated pool; the caller's request fails fast with a clear error.
		connectionTimeoutMillis: 10_000,
		// Return idle connections to the server so a quiet replica does not hold
		// its whole allowance open.
		idleTimeoutMillis: 30_000,
	};
}

/**
 * The one way services build their Postgres pool. Besides sizing and
 * timeouts, it attaches the pool's 'error' listener: pg emits an error on
 * behalf of an idle client whose connection drops (a failover, a network
 * blip), and without a listener Node treats that as an unhandled 'error'
 * event and terminates the process.
 */
export function createPgPool(settings: PgPoolSettings, logger: PoolLogger): pg.Pool {
	const pool = new pg.Pool(pgPoolOptions(settings));
	pool.on('error', (err) => {
		logger.error({ err, applicationName: settings.applicationName }, 'postgres pool: idle connection error (the connection is dropped and will be replaced)');
	});
	return pool;
}
