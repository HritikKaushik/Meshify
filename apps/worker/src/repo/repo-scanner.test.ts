import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLanguage, isBinaryBuffer, isDeniedPath, isReadme, scanExtractedRepo } from './repo-scanner.js';

describe('detectLanguage', () => {
	it('maps common extensions', () => {
		expect(detectLanguage('src/app.ts')).toBe('typescript');
		expect(detectLanguage('main.py')).toBe('python');
		expect(detectLanguage('README.md')).toBe('markdown');
		expect(detectLanguage('Dockerfile')).toBe('dockerfile');
		expect(detectLanguage('Makefile')).toBe('makefile');
		expect(detectLanguage('unknown.xyz')).toBeNull();
	});
});

describe('isDeniedPath', () => {
	it('denies vendored/build dirs anywhere in the path', () => {
		expect(isDeniedPath('node_modules/lodash/index.js')).toBe(true);
		expect(isDeniedPath('packages/app/node_modules/x/y.js')).toBe(true);
		expect(isDeniedPath('.git/HEAD')).toBe(true);
		expect(isDeniedPath('dist/main.js')).toBe(true);
	});

	it('denies lockfiles, minified bundles, and binary extensions', () => {
		expect(isDeniedPath('pnpm-lock.yaml')).toBe(true);
		expect(isDeniedPath('assets/app.min.js')).toBe(true);
		expect(isDeniedPath('logo.png')).toBe(true);
		expect(isDeniedPath('bin/tool.exe')).toBe(true);
	});

	it('allows normal source files', () => {
		expect(isDeniedPath('src/modules/chat/chat.controller.ts')).toBe(false);
		expect(isDeniedPath('README.md')).toBe(false);
		expect(isDeniedPath('config.yaml')).toBe(false);
	});
});

describe('isBinaryBuffer / isReadme', () => {
	it('flags null bytes as binary and text as text', () => {
		expect(isBinaryBuffer(Buffer.from([0x68, 0x00, 0x69]))).toBe(true);
		expect(isBinaryBuffer(Buffer.from('plain source code'))).toBe(false);
	});

	it('recognizes README variants', () => {
		expect(isReadme('README.md')).toBe(true);
		expect(isReadme('docs/readme.rst')).toBe(true);
		expect(isReadme('READMENOT.md')).toBe(false);
	});
});

describe('scanExtractedRepo', () => {
	it('walks a tree, strips a single wrapping root dir, filters junk, hashes content', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'meshify-scan-'));
		// simulate a GitHub tarball layout: everything under owner-repo-sha/
		const wrap = path.join(root, 'acme-demo-abc123');
		await mkdir(path.join(wrap, 'src'), { recursive: true });
		await mkdir(path.join(wrap, 'node_modules', 'x'), { recursive: true });
		await writeFile(path.join(wrap, 'README.md'), '# Demo');
		await writeFile(path.join(wrap, 'src', 'index.ts'), 'export const x = 1;');
		await writeFile(path.join(wrap, 'node_modules', 'x', 'index.js'), 'ignored');
		await writeFile(path.join(wrap, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		await writeFile(path.join(wrap, 'binary.dat'), Buffer.from([0x01, 0x00, 0x02]));
		await writeFile(path.join(wrap, 'empty.ts'), '');

		const files = await scanExtractedRepo(root);

		expect(files.map((f) => f.path)).toEqual(['README.md', 'src/index.ts']);
		const readme = files[0]!;
		expect(readme.isReadme).toBe(true);
		expect(readme.language).toBe('markdown');
		expect(readme.contentHash).toMatch(/^[0-9a-f]{64}$/);
		expect(files[1]!.language).toBe('typescript');
		expect(files[1]!.sizeBytes).toBe(19);
	});
});
