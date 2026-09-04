import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Flat ESLint config for the whole monorepo (one pass — `eslint .`). Pragmatic,
 * not pedantic: it catches real problems (unused vars, unsafe patterns) without
 * fighting the codebase's deliberate idioms (`req.auth!`, `as never` in tests).
 * Mostly syntax-only so it stays cheap in CI on top of the `tsc` typecheck that
 * already covers types; the one type-aware rule (no-floating-promises) is worth
 * its type pass.
 */
export default tseslint.config(
	{
		ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**', 'graphify-out/**', '.turbo/**', '**/*.d.ts', 'pipelines/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			// `any`/non-null-assertion are used intentionally (typed casts, req.auth!).
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			// Ignore intentionally-unused args/vars prefixed with `_`.
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
			'no-empty': ['error', { allowEmptyCatch: true }],
		},
	},
	{
		// Type-aware rule set for the TypeScript sources: a promise that is neither
		// awaited nor handed to `void` is the classic silent failure (a lost
		// refresh, a swallowed rejection that later crashes the process). Uses the
		// TypeScript project service, so it costs a type pass on top of tsc.
		files: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.ts'],
		ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.testutil.ts', 'packages/testing/**'],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			'@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
		},
	},
	{
		// Plain JS/MJS (scripts, config) run in Node — declare its globals so
		// console/process/URL aren't flagged as undefined (TS files get these from
		// their tsconfig lib, so this is only for non-TS files).
		files: ['**/*.{js,mjs,cjs}'],
		languageOptions: { globals: { ...globals.node } },
	},
	{
		// Static browser scripts served as-is (no bundler): browser globals apply.
		files: ['apps/web/public/**/*.js'],
		languageOptions: { globals: { ...globals.browser } },
	},
	{
		// Config files idiomatically use require() for plugins (tailwind, etc.).
		files: ['**/*.config.{ts,js,mjs,cjs}'],
		rules: { '@typescript-eslint/no-require-imports': 'off' },
	},
	{
		// React web app: enable the hooks rules (so the in-code
		// react-hooks/exhaustive-deps disable directives resolve, and rules-of-hooks
		// actually guards the components).
		files: ['apps/web/**/*.{ts,tsx}'],
		plugins: { 'react-hooks': reactHooks },
		rules: {
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
		},
	},
	{
		// Tests + test utilities lean on loose typing, empty stubs, and empty
		// augmentation interfaces (vitest matcher declarations) by design.
		files: ['**/*.test.ts', '**/*.testutil.ts', 'packages/testing/**', 'tests/**'],
		rules: {
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
		},
	},
);
