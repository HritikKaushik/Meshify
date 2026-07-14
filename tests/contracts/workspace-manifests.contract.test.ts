import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Repo-wide governance contract: keeps the monorepo's workspaces consistent as
 * they multiply — so a new app/package can't drift from the shared conventions
 * (scope, testability) without a red build.
 */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function workspaceDirs(group: string): string[] {
	const base = join(repoRoot, group);
	if (!existsSync(base)) return [];
	return readdirSync(base)
		.map((name) => join(base, name))
		.filter((dir) => existsSync(join(dir, 'package.json')));
}

const workspaces = [...workspaceDirs('apps'), ...workspaceDirs('packages')];
const manifest = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;

describe('workspace manifests (contract)', () => {
	it('discovers the apps and packages', () => {
		expect(workspaces.length).toBeGreaterThanOrEqual(5);
	});

	it.each(workspaces)('%s is @meshify-scoped', (dir) => {
		expect(String(manifest(dir).name)).toMatch(/^@meshify\//);
	});

	it.each(workspaces)('%s is testable (declares a test or typecheck script)', (dir) => {
		const scripts = (manifest(dir).scripts ?? {}) as Record<string, string>;
		expect(scripts.test ?? scripts.typecheck).toBeDefined();
	});
});
