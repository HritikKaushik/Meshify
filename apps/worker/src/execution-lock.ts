import type { Job } from 'bullmq';
import { DelayedError } from 'bullmq';
import type pg from 'pg';

/** Release function returned by a successful acquire. Always awaited in a finally. */
export type ReleaseLock = () => Promise<void>;

/** Mutual exclusion keyed by an arbitrary string; `tryAcquire` never blocks. */
export interface ExecutionLock {
	tryAcquire(key: string): Promise<ReleaseLock | undefined>;
}

/**
 * Postgres session-level advisory lock. The lock lives on a dedicated pooled
 * connection for as long as the holder runs and is released either explicitly
 * or by the server when that connection drops - a worker that dies mid-job
 * cannot leave the key locked. Keys hash through hashtext(), the scheme
 * migrate.ts already uses; a hash collision between two keys only causes a
 * spurious wait, never a missed exclusion.
 */
export class PgAdvisoryExecutionLock implements ExecutionLock {
	constructor(private readonly pool: pg.Pool) {}

	async tryAcquire(key: string): Promise<ReleaseLock | undefined> {
		const client = await this.pool.connect();
		let acquired = false;
		try {
			const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtext($1)) as locked', [key]);
			acquired = rows[0]?.locked === true;
		} finally {
			if (!acquired) client.release();
		}
		if (!acquired) return undefined;
		return async () => {
			try {
				await client.query('select pg_advisory_unlock(hashtext($1))', [key]);
				client.release();
			} catch (err) {
				// Never hand a still-locked session back to the pool: destroying the
				// connection makes the server drop the lock.
				client.release(err instanceof Error ? err : new Error(String(err)));
			}
		};
	}
}

/** Single-process lock for tests and local composition without Postgres. */
export class InMemoryExecutionLock implements ExecutionLock {
	private readonly held = new Set<string>();

	async tryAcquire(key: string): Promise<ReleaseLock | undefined> {
		if (this.held.has(key)) return undefined;
		this.held.add(key);
		return async () => void this.held.delete(key);
	}

	isHeld(key: string): boolean {
		return this.held.has(key);
	}
}

/** How long a contended job waits in the delayed set before it tries the lock again. */
export const LOCK_RETRY_DELAY_MS = 30_000;

/**
 * Serialize job execution per key across every worker replica. When another
 * job holds the key this one is parked in BullMQ's delayed set - no attempt is
 * consumed and no failure is recorded - and picked up again after
 * `retryDelayMs`. Its pipeline_jobs row stays 'queued' meanwhile, so the
 * dedupe index keeps collapsing further requests for the same connector onto
 * it instead of stacking a queue of identical syncs.
 */
export async function withExecutionLock<T>(
	job: Pick<Job, 'moveToDelayed'>,
	token: string | undefined,
	lock: ExecutionLock,
	key: string,
	work: () => Promise<T>,
	retryDelayMs = LOCK_RETRY_DELAY_MS
): Promise<T> {
	const release = await lock.tryAcquire(key);
	if (!release) {
		await job.moveToDelayed(Date.now() + retryDelayMs, token);
		throw new DelayedError(`execution lock "${key}" is held by another job; retrying in ${retryDelayMs}ms`);
	}
	try {
		return await work();
	} finally {
		await release();
	}
}

export const connectorLockKey = (connectorId: string): string => `meshify:sync:connector:${connectorId}`;
export const repositoryLockKey = (repositoryId: string): string => `meshify:sync:repository:${repositoryId}`;
