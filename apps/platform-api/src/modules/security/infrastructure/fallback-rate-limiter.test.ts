import { describe, expect, it, vi } from 'vitest';
import { FallbackRateLimiter } from './fallback-rate-limiter.js';
import type { RateLimitDecision } from './redis-rate-limiter.js';

const decision = (over: Partial<RateLimitDecision> = {}): RateLimitDecision => ({ allowed: true, limit: 10, remaining: 9, resetAt: 1000, ...over });

describe('FallbackRateLimiter', () => {
	it('uses the primary when it succeeds and never touches the fallback', async () => {
		const primary = { hit: vi.fn(async () => decision({ remaining: 5 })) };
		const fallback = { hit: vi.fn(async () => decision()) };
		const rl = new FallbackRateLimiter(primary, fallback);

		const d = await rl.hit('k');
		expect(d.remaining).toBe(5);
		expect(fallback.hit).not.toHaveBeenCalled();
	});

	it('falls back (and notifies) when the primary throws', async () => {
		const primary = { hit: vi.fn(async () => Promise.reject(new Error('redis down'))) };
		const fallback = { hit: vi.fn(async () => decision({ remaining: 1 })) };
		const onFallback = vi.fn();
		const rl = new FallbackRateLimiter(primary, fallback, onFallback);

		const d = await rl.hit('k');
		expect(d.remaining).toBe(1);
		expect(fallback.hit).toHaveBeenCalledWith('k');
		expect(onFallback).toHaveBeenCalledOnce();
	});

	it('propagates if the fallback also throws (guard then fails closed)', async () => {
		const primary = { hit: async () => Promise.reject(new Error('redis down')) };
		const fallback = { hit: async () => Promise.reject(new Error('memory down')) };
		const rl = new FallbackRateLimiter(primary, fallback);

		await expect(rl.hit('k')).rejects.toThrow('memory down');
	});
});
