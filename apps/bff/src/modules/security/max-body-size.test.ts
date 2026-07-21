import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { maxBodySize } from './max-body-size.js';

const LIMIT = 1000;

function run(method: string, headers: Record<string, string>) {
	const guard = maxBodySize(LIMIT);
	const req = { method, get: (n: string) => headers[n.toLowerCase()] } as unknown as Request;
	const json = vi.fn();
	const status = vi.fn(() => ({ json }) as unknown as Response);
	const res = { status } as unknown as Response;
	const next = vi.fn();
	guard(req, res, next);
	return { next, status, json };
}

describe('maxBodySize', () => {
	it('rejects a state-changing request over the limit with 413', () => {
		const { next, status, json } = run('POST', { 'content-length': String(LIMIT + 1) });
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(413);
		expect(json).toHaveBeenCalledWith({ error: 'Payload too large' });
	});

	it('allows a request at or under the limit', () => {
		const { next, status } = run('POST', { 'content-length': String(LIMIT) });
		expect(next).toHaveBeenCalledOnce();
		expect(status).not.toHaveBeenCalled();
	});

	it('allows a request with no Content-Length (bounded downstream)', () => {
		const { next, status } = run('POST', {});
		expect(next).toHaveBeenCalledOnce();
		expect(status).not.toHaveBeenCalled();
	});

	it('never gates safe methods', () => {
		for (const m of ['GET', 'HEAD', 'OPTIONS']) {
			const { next, status } = run(m, { 'content-length': String(LIMIT * 1000) });
			expect(next).toHaveBeenCalledOnce();
			expect(status).not.toHaveBeenCalled();
		}
	});
});
