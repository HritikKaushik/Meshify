import { describe, expect, it, beforeEach } from 'vitest';
import { loadEnv, resetEnvCache } from './env.js';

/** A minimal env that satisfies every required field, with strong secrets. */
function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
	return {
		NODE_ENV: 'production',
		PLATFORM_API_KEY_PEPPER: 'Zx9Q2mVt7Lr4Ke1Wp8Nc3Bd6Fj0Hs5YaUo',
		DATABASE_URL: 'postgres://u:p@db.example.com:5432/meshify',
		REDIS_URL: 'redis://redis.example.com:6379',
		QDRANT_URL: 'https://qdrant.example.com:6333',
		S3_ENDPOINT: 'https://s3.example.com',
		S3_BUCKET: 'meshify-documents',
		S3_ACCESS_KEY_ID: 'AKIAEXAMPLE1234',
		S3_SECRET_ACCESS_KEY: 'Vt7Lr4Ke1Wp8Nc3Bd6Fj0Hs5YaUoZx9Q2m',
		ROCKETRIDE_URI: 'https://api.rocketride.ai',
		ROCKETRIDE_APIKEY: 'rr_Zx9Q2mVt7Lr4Ke1Wp8',
		...overrides,
	};
}

describe('loadEnv production secret strength', () => {
	beforeEach(() => resetEnvCache());

	it('accepts strong random secrets in production', () => {
		expect(() => loadEnv(baseEnv())).not.toThrow();
	});

	it('rejects a placeholder pepper in production', () => {
		expect(() => loadEnv(baseEnv({ PLATFORM_API_KEY_PEPPER: 'change-me-to-a-random-32-char-string' }))).toThrow(/PLATFORM_API_KEY_PEPPER/);
	});

	it('rejects a low-entropy encryption key in production', () => {
		expect(() => loadEnv(baseEnv({ ORG_KEY_ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }))).toThrow(/ORG_KEY_ENCRYPTION_KEY/);
	});

	it('rejects a REPLACE_ME integration key in production', () => {
		expect(() => loadEnv(baseEnv({ INTEGRATION_ENCRYPTION_KEY: 'REPLACE_ME_WITH_A_RANDOM_32_CHAR_KEY' }))).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
	});

	it('does NOT enforce strength outside production', () => {
		expect(() => loadEnv(baseEnv({ NODE_ENV: 'development', PLATFORM_API_KEY_PEPPER: 'change-me-please-1234' }))).not.toThrow();
	});
});
