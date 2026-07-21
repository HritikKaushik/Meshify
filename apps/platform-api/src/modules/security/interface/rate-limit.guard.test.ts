import { describe, expect, it, vi } from 'vitest';
import { rateLimitGuard, type RateLimiter } from './rate-limit.guard.js';
import { mockRequest, mockResponse } from './http-mocks.testutil.js';

function limiter(hit: RateLimiter['hit']): RateLimiter {
	return { hit };
}

const authed = () => mockRequest({ auth: { orgId: 'o1', keyId: 'k1', scopes: [], isOrgAdmin: true } } as never);

describe('rateLimitGuard', () => {
	it('allows the request and sets RateLimit headers when under the limit', async () => {
		const res = mockResponse();
		const next = vi.fn();
		await rateLimitGuard(limiter(async () => ({ allowed: true, limit: 100, remaining: 99, resetAt: 1000 })))(authed(), res, next);

		expect(next).toHaveBeenCalledOnce();
		expect(res.getHeader('RateLimit-Remaining')).toBe(99);
		expect(res.getHeader('RateLimit-Limit')).toBe(100);
	});

	it('returns 429 with Retry-After when the limit is exceeded', async () => {
		const res = mockResponse();
		const next = vi.fn();
		const resetAt = Math.floor(Date.now() / 1000) + 30;
		await rateLimitGuard(limiter(async () => ({ allowed: false, limit: 100, remaining: 0, resetAt })))(authed(), res, next);

		expect(res.statusCode).toBe(429);
		expect(next).not.toHaveBeenCalled();
		expect(Number(res.getHeader('Retry-After'))).toBeGreaterThan(0);
	});

	it('keys the limit on the API key id', async () => {
		const hit = vi.fn(async () => ({ allowed: true, limit: 100, remaining: 50, resetAt: 1000 }));
		await rateLimitGuard(limiter(hit))(authed(), mockResponse(), vi.fn());
		expect(hit).toHaveBeenCalledWith('k1');
	});

	it('fails closed (503) when the limiter backend throws', async () => {
		const res = mockResponse();
		const next = vi.fn();
		await rateLimitGuard(
			limiter(async () => {
				throw new Error('redis down');
			})
		)(authed(), res, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.statusCode).toBe(503);
		expect(Number(res.getHeader('Retry-After'))).toBeGreaterThan(0);
	});

	it('passes through when there is no authenticated key', async () => {
		const next = vi.fn();
		await rateLimitGuard(limiter(async () => ({ allowed: false, limit: 1, remaining: 0, resetAt: 1 })))(mockRequest(), mockResponse(), next);
		expect(next).toHaveBeenCalledOnce();
	});
});
