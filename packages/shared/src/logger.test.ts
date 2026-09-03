import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from './logger.js';

/** A pino logger with the production redaction config, writing JSON lines into memory. */
function captureLogger() {
	const lines: string[] = [];
	const sink = new Writable({
		write(chunk, _enc, cb) {
			lines.push(chunk.toString());
			cb();
		},
	});
	const logger = pino({ level: 'info', redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, sink);
	return { logger, lines };
}

describe('logger redaction', () => {
	it('masks the key names the codebase actually stores secrets under, at several depths', () => {
		const { logger, lines } = captureLogger();
		logger.info(
			{
				apikey: 'sk-live-1',
				config: { api_key: 'sk-live-2', profile: 'openai', openai: { apikey: 'sk-live-3' } },
				vault: { encrypted_value: 'v2.abc', key_hash: 'deadbeef' },
				creds: { password: 'hunter2', secret: 's3', passphrase: 'p4' },
			},
			'provider connected'
		);
		const line = lines.join('');
		for (const leaked of ['sk-live-1', 'sk-live-2', 'sk-live-3', 'v2.abc', 'deadbeef', 'hunter2', '"s3"', '"p4"']) {
			expect(line, `expected ${leaked} to be redacted`).not.toContain(leaked);
		}
		expect(line).toContain('"profile":"openai"'); // non-secret siblings survive
		expect(line).toContain('[redacted]');
	});

	it('masks an HTTP client error that embeds its request headers', () => {
		const { logger, lines } = captureLogger();
		logger.error({ err: { message: 'boom', config: { headers: { authorization: 'Bearer msk_abc', cookie: '__session=xyz' } } } }, 'request failed');
		const line = lines.join('');
		expect(line).not.toContain('msk_abc');
		expect(line).not.toContain('__session=xyz');
		expect(line).toContain('"message":"boom"');
	});
});
