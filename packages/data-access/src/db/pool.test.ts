import { describe, expect, it, vi } from 'vitest';
import { createPgPool, pgPoolOptions } from './pool.js';

const settings = { connectionString: 'postgres://u:p@db.example.com:5432/meshify', max: 7, statementTimeoutMs: 15_000, applicationName: 'platform-api' };

describe('pgPoolOptions', () => {
	it('bounds the pool, names the application, and sets statement/checkout/idle timeouts', () => {
		expect(pgPoolOptions(settings)).toEqual({
			connectionString: settings.connectionString,
			max: 7,
			application_name: 'platform-api',
			statement_timeout: 15_000,
			connectionTimeoutMillis: 10_000,
			idleTimeoutMillis: 30_000,
		});
	});
});

describe('createPgPool', () => {
	it('logs idle-connection errors instead of letting them crash the process', async () => {
		const logger = { error: vi.fn() };
		const pool = createPgPool(settings, logger);
		try {
			pool.emit('error', new Error('terminating connection due to administrator command'));
			expect(logger.error).toHaveBeenCalledOnce();
			expect(logger.error.mock.calls[0]?.[0]).toMatchObject({ applicationName: 'platform-api' });
		} finally {
			await pool.end();
		}
	});
});
