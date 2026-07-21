import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { csrfOriginGuard } from './csrf-origin-guard.js';

const ALLOWED = ['https://app.example.com', 'http://localhost:5174'];

function run(method: string, headers: Record<string, string>) {
	const guard = csrfOriginGuard(ALLOWED);
	const req = {
		method,
		get: (name: string) => headers[name.toLowerCase()],
	} as unknown as Request;

	const json = vi.fn();
	const status = vi.fn(() => ({ json }) as unknown as Response);
	const res = { status } as unknown as Response;
	const next = vi.fn();

	guard(req, res, next);
	return { next, status, json };
}

describe('csrfOriginGuard', () => {
	it('allows safe methods regardless of Origin', () => {
		for (const method of ['GET', 'HEAD', 'OPTIONS']) {
			const { next, status } = run(method, {});
			expect(next).toHaveBeenCalledOnce();
			expect(status).not.toHaveBeenCalled();
		}
	});

	it('allows a state-changing request from an allowed Origin', () => {
		const { next, status } = run('POST', { origin: 'https://app.example.com' });
		expect(next).toHaveBeenCalledOnce();
		expect(status).not.toHaveBeenCalled();
	});

	it('rejects a forged Origin with 403', () => {
		const { next, status, json } = run('POST', { origin: 'https://evil.example.com' });
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(403);
		expect(json).toHaveBeenCalledWith({ error: 'csrf_origin_rejected' });
	});

	it('rejects a missing Origin (and no Referer) with 403', () => {
		const { next, status } = run('DELETE', {});
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(403);
	});

	it('falls back to the Referer origin when Origin is absent', () => {
		const { next, status } = run('POST', { referer: 'https://app.example.com/projects/42' });
		expect(next).toHaveBeenCalledOnce();
		expect(status).not.toHaveBeenCalled();
	});

	it('rejects when the Referer origin is not allowed', () => {
		const { next, status } = run('PATCH', { referer: 'https://evil.example.com/x' });
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(403);
	});

	it('ignores a malformed Referer (treats as no origin)', () => {
		const { next, status } = run('POST', { referer: 'not-a-url' });
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(403);
	});
});
