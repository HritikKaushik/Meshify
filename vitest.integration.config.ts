import { defineConfig } from 'vitest/config';

/**
 * Real-Postgres suites under tests/integration. Run with `pnpm test:integration`
 * against a migrated database (DATABASE_URL, default the compose Postgres on
 * :5433); every suite skips itself when none is reachable, and CI runs them
 * against a Postgres service (see .github/workflows/ci.yml, job `integration`).
 */
export default defineConfig({
	test: {
		include: ['tests/integration/**/*.integration.test.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
