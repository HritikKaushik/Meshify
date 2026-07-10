import type { Redis } from 'ioredis';

export interface RateLimitDecision {
	allowed: boolean;
	limit: number;
	remaining: number;
	/** Unix seconds when the current window resets. */
	resetAt: number;
}

/**
 * Fixed-window rate limiter backed by Redis. One counter key per identity per
 * window; INCR + EXPIRE (set only on the first hit of a window) is atomic
 * enough for this purpose and far cheaper than a sorted-set sliding window.
 * The window boundary is derived from the clock so all API replicas agree
 * without coordination.
 */
export class RedisRateLimiter {
	constructor(
		private readonly redis: Redis,
		private readonly max: number,
		private readonly windowSec: number
	) {}

	async hit(identity: string): Promise<RateLimitDecision> {
		const windowStart = Math.floor(Date.now() / 1000 / this.windowSec) * this.windowSec;
		const resetAt = windowStart + this.windowSec;
		const redisKey = `ratelimit:${identity}:${windowStart}`;

		const count = await this.redis.incr(redisKey);
		if (count === 1) {
			// First hit of this window — bound the key's lifetime to the window.
			await this.redis.expire(redisKey, this.windowSec);
		}

		const remaining = Math.max(0, this.max - count);
		return { allowed: count <= this.max, limit: this.max, remaining, resetAt };
	}
}
