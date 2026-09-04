import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config: one `pnpm test:coverage` runs every package's suite in
 * its own project (each package's vitest.config applies, e.g. jsdom for the web
 * app) and reports coverage over ALL source files, not only the ones a test
 * happened to import. The thresholds are a ratchet: set just under the level
 * measured when they were introduced, raise them as coverage grows, never
 * lower them to make a red run green.
 */
export default defineConfig({
	test: {
		projects: [
			'apps/*',
			'packages/*',
			{
				test: {
					name: 'repo',
					include: ['tests/contracts/**/*.test.ts', 'tests/smoke/**/*.test.ts'],
				},
			},
		],
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'lcov'],
			include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
			exclude: ['**/*.test.{ts,tsx}', '**/*.testutil.ts', '**/*.d.ts', 'packages/testing/**', 'apps/web/src/components/ui/**'],
			// Measured 2026-09-04: lines/statements 37.6%, branches 80%, functions 76.6%.
			thresholds: { lines: 35, statements: 35, functions: 72, branches: 76 },
		},
	},
});
