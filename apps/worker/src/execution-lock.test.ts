import { describe, expect, it, vi } from 'vitest';
import { DelayedError } from 'bullmq';
import { InMemoryExecutionLock, LOCK_RETRY_DELAY_MS, withExecutionLock } from './execution-lock.js';

function fakeJob() {
	return { moveToDelayed: vi.fn(async (_timestamp: number, _token?: string) => undefined) };
}

describe('withExecutionLock', () => {
	it('runs the work while holding the key and releases it afterwards', async () => {
		const lock = new InMemoryExecutionLock();
		let heldDuringWork = false;
		const result = await withExecutionLock(fakeJob(), 'tok', lock, 'k', async () => {
			heldDuringWork = lock.isHeld('k');
			return 42;
		});
		expect(result).toBe(42);
		expect(heldDuringWork).toBe(true);
		expect(lock.isHeld('k')).toBe(false);
	});

	it('releases the key when the work throws, and rethrows', async () => {
		const lock = new InMemoryExecutionLock();
		await expect(withExecutionLock(fakeJob(), 'tok', lock, 'k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
		expect(lock.isHeld('k')).toBe(false);
	});

	it('parks a contended job in the delayed set without consuming an attempt', async () => {
		const lock = new InMemoryExecutionLock();
		const release = await lock.tryAcquire('k');
		const job = fakeJob();
		const work = vi.fn(async () => undefined);
		const before = Date.now();

		await expect(withExecutionLock(job, 'tok', lock, 'k', work)).rejects.toBeInstanceOf(DelayedError);

		expect(work).not.toHaveBeenCalled();
		expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
		const [timestamp, token] = job.moveToDelayed.mock.calls[0]!;
		expect(token).toBe('tok');
		expect(timestamp).toBeGreaterThanOrEqual(before + LOCK_RETRY_DELAY_MS);
		await release!();
		expect(lock.isHeld('k')).toBe(false);
	});

	it('does not touch the job when the lock is free, so a plain error still fails normally', async () => {
		const job = fakeJob();
		await expect(withExecutionLock(job, 'tok', new InMemoryExecutionLock(), 'k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
		expect(job.moveToDelayed).not.toHaveBeenCalled();
	});
});
