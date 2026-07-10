import pino from 'pino';

export interface LoggerOptions {
	level: string;
	/** Service name stamped on every log line (e.g. "platform-api", "worker"). */
	service: string;
}

export function createLogger(options: LoggerOptions) {
	return pino({ level: options.level, base: { service: options.service } });
}

export type Logger = ReturnType<typeof createLogger>;
