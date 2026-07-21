import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createMetrics } from './metrics.js';

function mockReq(over: Partial<Request> = {}): Request {
	return { path: '/v1/x', method: 'GET', get: () => undefined, ...over } as unknown as Request;
}

function mockRes() {
	const headers: Record<string, string> = {};
	let body = '';
	let statusCode = 200;
	const res = {
		setHeader: (k: string, v: string) => (headers[k] = v),
		send: (b: string) => (body = b),
		status: (c: number) => ((statusCode = c), res),
		json: (o: unknown) => (body = JSON.stringify(o)),
		on: vi.fn(), // res.on('finish', …) used by the timing middleware
	} as unknown as Response;
	return { res, headers, get body() {return body;}, get statusCode() {return statusCode;} };
}

describe('createMetrics', () => {
	it('renders the Prometheus exposition with default process metrics', async () => {
		const { metricsHandler } = createMetrics();
		const m = mockRes();
		await metricsHandler(mockReq({ path: '/metrics' }), m.res, vi.fn());
		expect(m.headers['Content-Type']).toMatch(/text\/plain/);
		expect(m.body).toMatch(/process_cpu_user_seconds_total|nodejs_/);
	});

	it('gates /metrics behind the bearer token when set', async () => {
		const { metricsHandler } = createMetrics({ token: 'secret' });
		const denied = mockRes();
		await metricsHandler(mockReq({ get: (() => undefined) as never }), denied.res, vi.fn());
		expect(denied.statusCode).toBe(401);

		const allowed = mockRes();
		await metricsHandler(mockReq({ get: ((h: string) => (h.toLowerCase() === 'authorization' ? 'Bearer secret' : undefined)) as never }), allowed.res, vi.fn());
		expect(allowed.body).toMatch(/nodejs_|process_/);
	});

	it('httpMiddleware skips /metrics and otherwise calls next', () => {
		const { httpMiddleware } = createMetrics();
		const skip = vi.fn();
		httpMiddleware(mockReq({ path: '/metrics' }), mockRes().res, skip);
		expect(skip).toHaveBeenCalledOnce();

		const next = vi.fn();
		httpMiddleware(mockReq({ path: '/v1/x' }), mockRes().res, next);
		expect(next).toHaveBeenCalledOnce();
	});
});
