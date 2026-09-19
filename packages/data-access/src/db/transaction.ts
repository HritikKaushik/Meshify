import type pg from 'pg';

/**
 * Runs `work` inside one BEGIN ... COMMIT on a dedicated connection, rolling
 * back on any throw. Repositories constructed over the handed-in client (see
 * `Queryable`) issue their statements inside this transaction, which is how a
 * change and its audit/domain event are made atomic.
 */
export async function withTransaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	let inTransaction = false;
	try {
		await client.query('begin');
		inTransaction = true;
		const result = await work(client);
		await client.query('commit');
		inTransaction = false;
		return result;
	} catch (err) {
		if (inTransaction) await client.query('rollback').catch(() => undefined);
		throw err;
	} finally {
		client.release();
	}
}
