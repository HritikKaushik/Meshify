import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from './in-memory-rate-limiter.js';

describe('InMemoryRateLimiter', () => {
	it('allows up to max within a window, then denies', async () => {
		const rl = new InMemoryRateLimiter(3, 60);
		const d1 = await rl.hit('k');
		const d2 = await rl.hit('k');
		const d3 = await rl.hit('k');
		const d4 = await rl.hit('k');

		expect(d1.allowed).toBe(true);
		expect(d1.remaining).toBe(2);
		expect(d3.allowed).toBe(true);
		expect(d3.remaining).toBe(0);
		expect(d4.allowed).toBe(false);
		expect(d4.remaining).toBe(0);
	});

	it('tracks identities independently', async () => {
		const rl = new InMemoryRateLimiter(1, 60);
		expect((await rl.hit('a')).allowed).toBe(true);
		expect((await rl.hit('a')).allowed).toBe(false);
		expect((await rl.hit('b')).allowed).toBe(true);
	});

	it('reports a resetAt at the end of the current window', async () => {
		const rl = new InMemoryRateLimiter(5, 60);
		const d = await rl.hit('k');
		const now = Math.floor(Date.now() / 1000);
		expect(d.resetAt).toBeGreaterThan(now);
		expect(d.resetAt - now).toBeLessThanOrEqual(60);
	});
});
