import type { ErrorRequestHandler } from 'express';

interface ErrorLogger {
	error: (obj: unknown, msg: string) => void;
	warn: (obj: unknown, msg: string) => void;
}

/** Errors thrown by body-parser, multer and http-errors carry an HTTP status and a stable type/code. */
interface HttpishError {
	status?: number;
	statusCode?: number;
	type?: string;
	code?: string;
	expose?: boolean;
	message?: string;
}

/**
 * Terminal error middleware — the only place an unexpected error is turned
 * into a response. Mounted last in main.ts so every controller shares one JSON
 * error shape instead of Express's default HTML page with a stack trace.
 *
 * Client-caused failures keep their status and a terse message; anything else
 * is a 500 whose body deliberately says nothing about the cause (the cause is
 * logged with the request id so it can be found).
 */
export function createErrorHandler(log: ErrorLogger): ErrorRequestHandler {
	return (err, req, res, next) => {
		if (res.headersSent) {
			// A response was already streaming (e.g. SSE); let Express close the socket.
			next(err);
			return;
		}
		const mapped = classify(err);
		const reqLog = ((req as unknown as { log?: ErrorLogger }).log ?? log) as ErrorLogger;
		if (mapped.status >= 500) {
			reqLog.error({ err }, 'unhandled request error');
		} else {
			reqLog.warn({ err: { message: (err as HttpishError)?.message, code: (err as HttpishError)?.code }, status: mapped.status }, 'request rejected');
		}
		res.status(mapped.status).json({ error: mapped.message });
	};
}

function classify(err: unknown): { status: number; message: string } {
	const e = (err ?? {}) as HttpishError;
	// multer: file above the configured limit (or an unexpected field).
	if (e.code === 'LIMIT_FILE_SIZE') return { status: 413, message: 'File exceeds the maximum allowed size' };
	if (typeof e.code === 'string' && e.code.startsWith('LIMIT_')) return { status: 400, message: e.message ?? 'Invalid upload' };
	// body-parser (express.json / express.raw).
	if (e.type === 'entity.too.large') return { status: 413, message: 'Request body exceeds the maximum allowed size' };
	if (e.type === 'entity.parse.failed') return { status: 400, message: 'Malformed request body' };
	if (e.type === 'encoding.unsupported' || e.type === 'charset.unsupported') return { status: 415, message: 'Unsupported request encoding' };
	// Anything else carrying a 4xx status (http-errors convention) is a client error.
	const status = e.status ?? e.statusCode;
	if (typeof status === 'number' && status >= 400 && status < 500) {
		return { status, message: e.expose !== false && e.message ? e.message : 'Bad request' };
	}
	return { status: 500, message: 'Internal server error' };
}
