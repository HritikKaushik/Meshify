import type { RateLimitDecision } from './redis-rate-limiter.js';

interface Limiter {
	hit(identity: string): Promise<RateLimitDecision>;
}

/**
 * Wraps a primary (shared/Redis) limiter with a process-local fallback. When the
 * primary throws — e.g. Redis unreachable — throttling continues against the
 * fallback instead of failing open. Only if the fallback ALSO throws does the
 * error propagate (the guard then fails closed). `onFallback` fires once per
 * primary failure so the outage is observable.
 */
export class FallbackRateLimiter {
	constructor(
		private readonly primary: Limiter,
		private readonly fallback: Limiter,
		private readonly onFallback?: (err: unknown) => void
	) {}

	async hit(identity: string): Promise<RateLimitDecision> {
		try {
			return await this.primary.hit(identity);
		} catch (err) {
			this.onFallback?.(err);
			return this.fallback.hit(identity);
		}
	}
}
