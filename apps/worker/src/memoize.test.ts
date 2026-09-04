import { describe, expect, it, vi } from 'vitest';
import { memoizeForMs } from './memoize.js';

describe('memoizeForMs', () => {
	it('returns the cached value within the ttl and refreshes after it', async () => {
		let clock = 1_000;
		const fn = vi.fn(async () => `v${fn.mock.calls.length}`);
		const get = memoizeForMs(fn, 100, () => clock);
		expect(await get()).toBe('v1');
		expect(await get()).toBe('v1');
		clock += 101;
		expect(await get()).toBe('v2');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('shares one in-flight call between concurrent callers', async () => {
		const fn = vi.fn(async () => 'tok');
		const get = memoizeForMs(fn, 1_000);
		await Promise.all([get(), get(), get()]);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('does not cache a failure', async () => {
		let fail = true;
		const fn = vi.fn(async () => {
			if (fail) throw new Error('vault unavailable');
			return 'tok';
		});
		const get = memoizeForMs(fn, 1_000);
		await expect(get()).rejects.toThrow('vault unavailable');
		fail = false;
		expect(await get()).toBe('tok');
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
