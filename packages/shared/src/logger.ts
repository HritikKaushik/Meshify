import pino from 'pino';

export interface LoggerOptions {
	level: string;
	/** Service name stamped on every log line (e.g. "platform-api", "worker"). */
	service: string;
}

export function createLogger(options: LoggerOptions) {
	return pino({
		level: options.level,
		base: { service: options.service },
		// Credentials must never reach the logs. pino-http serializes request/
		// response headers, which carry the Authorization API key (platform-api)
		// and the Clerk session cookie (bff); mask them wherever they appear.
		redact: {
			paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
			censor: '[redacted]',
		},
	});
}

export type Logger = ReturnType<typeof createLogger>;
