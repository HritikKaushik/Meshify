import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { RedisRateLimiter } from './redis-rate-limiter.js';

/**
 * Fake ioredis that evaluates the limiter's Lua script the way Redis would:
 * INCR, then EXPIRE on the first hit of a key (or when it carries no TTL).
 * Records EXPIRE calls and the scripts it was handed.
 */
function fakeRedis() {
	const counters = new Map<string, number>();
	const ttls = new Map<string, number>();
	const expires: Array<{ key: string; ttl: number }> = [];
	const scripts: string[] = [];
	const redis = {
		async eval(script: string, numKeys: number, key: string, ttl: number | string) {
			scripts.push(script);
			expect(numKeys).toBe(1);
			const next = (counters.get(key) ?? 0) + 1;
			counters.set(key, next);
			if (next === 1 || !ttls.has(key)) {
				ttls.set(key, Number(ttl));
				expires.push({ key, ttl: Number(ttl) });
			}
			return next;
		},
	} as unknown as Redis;
	return { redis, expires, counters, ttls, scripts };
}

describe('RedisRateLimiter', () => {
	it('allows up to max then blocks, decrementing remaining', async () => {
		const { redis } = fakeRedis();
		const limiter = new RedisRateLimiter(redis, 3, 60);

		const d1 = await limiter.hit('k1');
		const d2 = await limiter.hit('k1');
		const d3 = await limiter.hit('k1');
		const d4 = await limiter.hit('k1');

		expect([d1.remaining, d2.remaining, d3.remaining]).toEqual([2, 1, 0]);
		expect([d1.allowed, d2.allowed, d3.allowed]).toEqual([true, true, true]);
		expect(d4.allowed).toBe(false);
		expect(d4.remaining).toBe(0);
	});

	it('sets the window TTL only on the first hit of a window', async () => {
		const { redis, expires } = fakeRedis();
		const limiter = new RedisRateLimiter(redis, 5, 60);
		await limiter.hit('k1');
		await limiter.hit('k1');
		expect(expires).toHaveLength(1);
		expect(expires[0]).toEqual({ key: expect.stringContaining('ratelimit:k1:'), ttl: 60 });
	});

	it('increments and expires in one server-side script, and repairs a counter that lost its TTL', async () => {
		const { redis, scripts, ttls, expires } = fakeRedis();
		const limiter = new RedisRateLimiter(redis, 5, 60);
		await limiter.hit('k1');
		expect(scripts[0]).toMatch(/INCR/);
		expect(scripts[0]).toMatch(/EXPIRE/);
		// Simulate a key left behind without a TTL (the failure the script guards against).
		ttls.clear();
		await limiter.hit('k1');
		expect(expires).toHaveLength(2);
	});

	it('isolates counters per identity', async () => {
		const { redis } = fakeRedis();
		const limiter = new RedisRateLimiter(redis, 1, 60);
		expect((await limiter.hit('a')).allowed).toBe(true);
		expect((await limiter.hit('b')).allowed).toBe(true);
		expect((await limiter.hit('a')).allowed).toBe(false);
	});

	it('rolls over to a fresh window when the clock advances', async () => {
		const { redis } = fakeRedis();
		const limiter = new RedisRateLimiter(redis, 1, 60);
		const base = 1_000_000_000_000;
		vi.spyOn(Date, 'now').mockReturnValue(base);
		expect((await limiter.hit('k1')).allowed).toBe(true);
		expect((await limiter.hit('k1')).allowed).toBe(false);

		vi.spyOn(Date, 'now').mockReturnValue(base + 61_000);
		expect((await limiter.hit('k1')).allowed).toBe(true);
		vi.restoreAllMocks();
	});
});
