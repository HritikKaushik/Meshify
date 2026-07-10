import type { Request, Response } from 'express';
import { vi } from 'vitest';

/** Minimal Express Response double capturing status/json/headers/finish. */
export function mockResponse() {
	const headers: Record<string, unknown> = {};
	let finishHandler: (() => void) | undefined;
	const res = {
		statusCode: 200,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json: vi.fn(function (this: typeof res) {
			return this;
		}),
		send: vi.fn(function (this: typeof res) {
			return this;
		}),
		setHeader(name: string, value: unknown) {
			headers[name] = value;
			return this;
		},
		getHeader(name: string) {
			return headers[name];
		},
		on(event: string, handler: () => void) {
			if (event === 'finish') finishHandler = handler;
			return this;
		},
		emitFinish() {
			finishHandler?.();
		},
	};
	return res as unknown as Response & { statusCode: number; emitFinish(): void; getHeader(n: string): unknown };
}

/** Minimal Express Request double. */
export function mockRequest(overrides: Partial<Request> = {}): Request {
	return {
		method: 'POST',
		path: '/v1/projects',
		originalUrl: '/v1/projects',
		params: {},
		headers: {},
		header(name: string) {
			return (this.headers as Record<string, string>)[name.toLowerCase()];
		},
		socket: { remoteAddress: '10.0.0.1' },
		log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
		...overrides,
	} as unknown as Request;
}
