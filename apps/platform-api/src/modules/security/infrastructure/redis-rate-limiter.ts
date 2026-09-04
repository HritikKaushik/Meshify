import type { Redis } from 'ioredis';

export interface RateLimitDecision {
	allowed: boolean;
	limit: number;
	remaining: number;
	/** Unix seconds when the current window resets. */
	resetAt: number;
}

/**
 * INCR the window counter and, on the hit that creates the key (or if the key
 * somehow has no TTL), bound its lifetime to the window - in one atomic step.
 * Doing INCR and EXPIRE as two commands left a window where a crash or a
 * dropped connection between them created a counter that never expired, which
 * then blocked that identity for good.
 */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Fixed-window rate limiter backed by Redis. One counter key per identity per
 * window, advanced by a small Lua script so the increment and the TTL are
 * atomic. The window boundary is derived from the clock so all API replicas
 * agree without coordination.
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

		const count = Number(await this.redis.eval(HIT_SCRIPT, 1, redisKey, this.windowSec));

		const remaining = Math.max(0, this.max - count);
		return { allowed: count <= this.max, limit: this.max, remaining, resetAt };
	}
}
