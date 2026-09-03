import type pg from 'pg';

/**
 * The slice of `pg.Pool` / `pg.PoolClient` a repository needs. Repositories
 * that accept this instead of a Pool can take part in a caller's transaction:
 * hand them the checked-out `PoolClient` and every statement they issue runs
 * inside the caller's BEGIN … COMMIT.
 */
export interface Queryable {
	query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}
