import type { NextFunction, Request, Response } from 'express';
import type { RateLimitDecision } from '../infrastructure/redis-rate-limiter.js';

/** The slice of a rate limiter the guard depends on (fakeable in tests). */
export interface RateLimiter {
	hit(identity: string): Promise<RateLimitDecision>;
}

/**
 * Per-API-key rate limit. Mount AFTER authGuard so `req.auth.keyId` is the
 * identity — limits follow the credential, not a spoofable client IP. Emits
 * standard `RateLimit-*` headers; 429 + `Retry-After` on exhaustion. If the
 * limiter backend errors, requests are allowed through (fail-open) so a Redis
 * blip degrades throttling rather than the whole API.
 */
export function rateLimitGuard(limiter: RateLimiter) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const identity = req.auth?.keyId;
		if (!identity) {
			next();
			return;
		}

		let decision: RateLimitDecision;
		try {
			decision = await limiter.hit(identity);
		} catch (err) {
			req.log?.warn({ err }, 'rate limiter unavailable — allowing request');
			next();
			return;
		}

		res.setHeader('RateLimit-Limit', decision.limit);
		res.setHeader('RateLimit-Remaining', decision.remaining);
		res.setHeader('RateLimit-Reset', decision.resetAt);

		if (!decision.allowed) {
			const retryAfter = Math.max(1, decision.resetAt - Math.floor(Date.now() / 1000));
			res.setHeader('Retry-After', retryAfter);
			res.status(429).json({ error: 'Rate limit exceeded' });
			return;
		}

		next();
	};
}
