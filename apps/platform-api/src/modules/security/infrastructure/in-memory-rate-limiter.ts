import type { RateLimitDecision } from './redis-rate-limiter.js';

/**
 * Process-local fixed-window limiter — the SAME algorithm as {@link RedisRateLimiter}
 * but backed by an in-process Map. Used ONLY as a fallback when the shared Redis
 * limiter is unreachable, so a Redis outage still bounds abuse (per API replica)
 * instead of removing throttling entirely. Counters are not shared across
 * replicas, so the effective ceiling while degraded is `max × replicas` — an
 * acceptable trade for a short outage window, and far safer than failing open.
 */
export class InMemoryRateLimiter {
	private readonly counters = new Map<string, { count: number; windowStart: number }>();

	constructor(
		private readonly max: number,
		private readonly windowSec: number
	) {}

	async hit(identity: string): Promise<RateLimitDecision> {
		const windowStart = Math.floor(Date.now() / 1000 / this.windowSec) * this.windowSec;
		const resetAt = windowStart + this.windowSec;

		const entry = this.counters.get(identity);
		let count: number;
		if (!entry || entry.windowStart !== windowStart) {
			count = 1;
			this.counters.set(identity, { count, windowStart });
			this.prune(windowStart);
		} else {
			count = ++entry.count;
		}

		const remaining = Math.max(0, this.max - count);
		return { allowed: count <= this.max, limit: this.max, remaining, resetAt };
	}

	/** Drop entries from prior windows so the map can't grow unbounded. */
	private prune(currentWindowStart: number): void {
		for (const [id, entry] of this.counters) {
			if (entry.windowStart < currentWindowStart) this.counters.delete(id);
		}
	}
}
