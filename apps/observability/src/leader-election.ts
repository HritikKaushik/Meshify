import pg from 'pg';
import type { Logger } from '@meshify/shared';

// A stable name → int4 (via hashtext server-side) for the session-level advisory
// lock. Distinctive so it won't collide with any other advisory lock.
const LEADER_LOCK = "pg_advisory_lock(hashtext('meshify:observability:leader'))";

/**
 * Blocks until THIS process holds the observability leader lock (a Postgres
 * session-level advisory lock on a dedicated connection). Only the holder should
 * subscribe to DAP events / write `pipeline_runs`; other replicas block here as
 * hot standbys and take over the instant the leader's connection drops (which
 * releases the lock).
 *
 * If the lock connection is later lost, the process exits so it restarts and
 * re-contends — it must never keep consuming without the lock, which would
 * double-write. The lock client is intentionally kept open for the process
 * lifetime to hold the lock.
 */
export async function acquireLeadership(databaseUrl: string, logger: Logger): Promise<void> {
	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	client.on('error', (err) => {
		logger.error({ err }, 'observability leader lock connection lost — exiting to re-contend');
		process.exit(1);
	});

	logger.info({}, 'contending for observability leadership…');
	await client.query(`SELECT ${LEADER_LOCK}`);
	logger.info({}, 'acquired observability leadership');
}
