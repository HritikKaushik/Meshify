import pino from 'pino';
import type { Env } from '@meshify/config';

export function createLogger(env: Env) {
	return pino({ level: env.PLATFORM_LOG_LEVEL, base: { service: 'platform-api' } });
}

export type Logger = ReturnType<typeof createLogger>;
