import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — the single place shared test behaviour and unified
 * coverage live.
 *
 * - Per-package/app isolation comes from each workspace's own `test` script
 *   (`vitest run`) run in parallel by `turbo run test`.
 * - Running `vitest run --coverage` from the repo root produces ONE merged
 *   coverage report across every app and package.
 *
 * Default test discovery is intentionally left untouched (every `*.test.ts`
 * across the workspace, excluding node_modules/dist) so the suite composition
 * never silently changes.
 */
export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'html', 'lcov'],
			reportsDirectory: './coverage',
			// Only measure product source; exclude tests, build output, the testing
			// package itself, composition roots and one-off CLI scripts.
			include: ['apps/*/src/**', 'packages/*/src/**'],
			exclude: [
				'**/*.test.ts',
				'**/*.d.ts',
				'**/dist/**',
				'packages/testing/**',
				'**/main.ts',
				'**/*.config.*',
				'**/migrate.ts',
				'**/scripts/**',
				'**/check.ts',
				'**/export-pipelines.ts',
			],
		},
	},
});
