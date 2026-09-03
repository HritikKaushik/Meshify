import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createErrorHandler } from './error-handler.js';
import { mockRequest, mockResponse } from '../modules/security/interface/http-mocks.testutil.js';

function run(err: unknown, opts: { headersSent?: boolean } = {}) {
	const log = { error: vi.fn(), warn: vi.fn() };
	const res = mockResponse() as Response & { statusCode: number; json: ReturnType<typeof vi.fn> };
	(res as unknown as { headersSent: boolean }).headersSent = opts.headersSent ?? false;
	const next = vi.fn() as unknown as NextFunction;
	createErrorHandler(log)(err, mockRequest() as Request, res, next);
	return { res, next, log };
}

describe('createErrorHandler', () => {
	it('maps a multer file-size error to 413 without leaking internals', () => {
		const { res } = run(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' }));
		expect(res.statusCode).toBe(413);
		expect(res.json).toHaveBeenCalledWith({ error: 'File exceeds the maximum allowed size' });
	});

	it('maps body-parser errors to their client status', () => {
		expect(run({ type: 'entity.too.large', status: 413, message: 'x' }).res.statusCode).toBe(413);
		expect(run({ type: 'entity.parse.failed', status: 400, message: 'x' }).res.statusCode).toBe(400);
	});

	it('keeps an exposed 4xx http-error status and message', () => {
		const { res } = run({ status: 404, expose: true, message: 'Nope' });
		expect(res.statusCode).toBe(404);
		expect(res.json).toHaveBeenCalledWith({ error: 'Nope' });
	});

	it('turns anything else into a generic 500 and logs the cause', () => {
		const err = new Error('invalid input syntax for type uuid: "abc"');
		const { res, log } = run(err);
		expect(res.statusCode).toBe(500);
		expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
		// The request logger (req.log) is preferred; the fallback logger stays silent here.
		expect(log.error).not.toHaveBeenCalled();
	});

	it('delegates to Express when headers were already sent', () => {
		const { next, res } = run(new Error('mid-stream'), { headersSent: true });
		expect(next).toHaveBeenCalledOnce();
		expect(res.json).not.toHaveBeenCalled();
	});
});
