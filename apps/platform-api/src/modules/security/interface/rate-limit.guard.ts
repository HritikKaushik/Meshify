import type { NextFunction, Request, Response } from 'express';
import type { RateLimitDecision } from '../infrastructure/redis-rate-limiter.js';

/** The slice of a rate limiter the guard depends on (fakeable in tests). */
export interface RateLimiter {
	hit(identity: string): Promise<RateLimitDecision>;
}

/**
 * Rate limit for authenticated traffic. Mount AFTER authGuard so the identity
 * comes from the credential, never from a spoofable client IP.
 *
 * Identity: `<keyId>:<actorId>` when the BFF forwarded the end user behind
 * the request, else the key id alone. Every browser session in an org shares
 * one org API key, so keying on the key alone let a single user's tab burn
 * the whole org's budget. The optional `keyCeiling` limiter is then hit on the
 * bare key id as an org-wide cap, so an org cannot multiply its budget by
 * spraying actor ids either. Emits standard `RateLimit-*` headers for the
 * tighter of the two decisions; 429 + `Retry-After` on exhaustion.
 *
 * Fails CLOSED (503) if a limiter throws. In production the limiters are
 * {@link FallbackRateLimiter}s that already degrade a Redis outage to an
 * in-process limiter, so a throw here is a genuine last resort - refusing the
 * request is safer than dropping throttling entirely (the previous fail-open
 * behaviour let a Redis blip disable rate limiting for the whole API).
 */
export function rateLimitGuard(limiter: RateLimiter, keyCeiling?: RateLimiter) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const keyId = req.auth?.keyId;
		if (!keyId) {
			next();
			return;
		}
		const identity = req.auth?.actorId ? `${keyId}:${req.auth.actorId}` : keyId;

		let decision: RateLimitDecision;
		try {
			decision = await limiter.hit(identity);
			if (keyCeiling) decision = tighter(decision, await keyCeiling.hit(keyId));
		} catch (err) {
			req.log?.error({ err }, 'rate limiter unavailable — failing closed');
			res.setHeader('Retry-After', 5);
			res.status(503).json({ error: 'Service temporarily unavailable' });
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

/** The decision that constrains the caller more: a denial wins, then the fewer remaining requests. */
function tighter(a: RateLimitDecision, b: RateLimitDecision): RateLimitDecision {
	if (a.allowed !== b.allowed) return a.allowed ? b : a;
	return a.remaining <= b.remaining ? a : b;
}
