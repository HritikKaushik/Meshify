import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Stage A of repository ingestion: pure filtering/classification logic over an extracted archive. */

export interface ScannedFile {
	/** Repo-relative path with forward slashes. */
	path: string;
	buffer: Buffer;
	language: string | null;
	sizeBytes: number;
	contentHash: string;
	isReadme: boolean;
}

const MAX_FILE_BYTES = 1024 * 1024; // >1MB source files are near-always generated artifacts
const BINARY_SNIFF_BYTES = 8192;

const DENY_DIRS = new Set([
	'.git',
	'node_modules',
	'dist',
	'build',
	'out',
	'.next',
	'.nuxt',
	'.turbo',
	'coverage',
	'vendor',
	'__pycache__',
	'.venv',
	'venv',
	'target',
	'.idea',
	'.vscode',
	'.pytest_cache',
	'.mypy_cache',
]);

const DENY_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'poetry.lock', 'Gemfile.lock', '.DS_Store']);

const DENY_EXTENSIONS = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'pdf',
	'woff', 'woff2', 'ttf', 'otf', 'eot',
	'zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'jar', 'war',
	'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'class', 'pyc', 'wasm',
	'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'flac', 'ogg',
	'db', 'sqlite', 'sqlite3', 'parquet', 'ipynb_checkpoints', 'lock', 'min.js', 'min.css', 'map',
]);

const EXTENSION_LANGUAGES: Record<string, string> = {
	ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
	js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
	py: 'python', go: 'go', rs: 'rust',
	java: 'java', kt: 'kotlin', scala: 'scala', groovy: 'groovy',
	c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
	cs: 'csharp', fs: 'fsharp', rb: 'ruby', php: 'php', swift: 'swift',
	sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
	yaml: 'yaml', yml: 'yaml', json: 'json', toml: 'toml', xml: 'xml',
	md: 'markdown', markdown: 'markdown', rst: 'restructuredtext', txt: 'text',
	html: 'html', css: 'css', scss: 'scss', less: 'less', vue: 'vue', svelte: 'svelte',
	tf: 'terraform', dockerfile: 'dockerfile', proto: 'protobuf', graphql: 'graphql', prisma: 'prisma',
};

export function detectLanguage(filePath: string): string | null {
	const base = path.basename(filePath).toLowerCase();
	if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
	if (base === 'makefile') return 'makefile';
	const ext = base.includes('.') ? base.split('.').pop()! : '';
	return EXTENSION_LANGUAGES[ext] ?? null;
}

export function isReadme(filePath: string): boolean {
	return /^readme(\.\w+)?$/i.test(path.basename(filePath));
}

export function isDeniedPath(relPath: string): boolean {
	const segments = relPath.split('/');
	if (segments.some((s) => DENY_DIRS.has(s))) return true;
	const base = segments[segments.length - 1]!;
	if (DENY_FILES.has(base)) return true;
	if (base.endsWith('.min.js') || base.endsWith('.min.css') || base.endsWith('.map')) return true;
	const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
	return DENY_EXTENSIONS.has(ext);
}

/** Null byte in the first 8KB = binary. Cheap and reliable for source trees. */
export function isBinaryBuffer(buffer: Buffer): boolean {
	return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

export function hashContent(buffer: Buffer): string {
	return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Walks an extracted archive directory and returns every ingestable file.
 * If the archive wrapped everything in a single top-level folder (GitHub
 * tarballs always do, ZIP exports usually do), that folder is stripped from
 * the reported paths.
 */
export async function scanExtractedRepo(rootDir: string): Promise<ScannedFile[]> {
	const effectiveRoot = await unwrapSingleRootDir(rootDir);
	const results: ScannedFile[] = [];
	await walk(effectiveRoot, effectiveRoot, results);
	results.sort((a, b) => a.path.localeCompare(b.path));
	return results;
}

async function unwrapSingleRootDir(rootDir: string): Promise<string> {
	const entries = (await readdir(rootDir, { withFileTypes: true })).filter((e) => e.name !== '__MACOSX');
	if (entries.length === 1 && entries[0]!.isDirectory()) {
		return path.join(rootDir, entries[0]!.name);
	}
	return rootDir;
}

async function walk(root: string, dir: string, results: ScannedFile[]): Promise<void> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const absolute = path.join(dir, entry.name);
		const relative = path.relative(root, absolute).split(path.sep).join('/');

		if (entry.isDirectory()) {
			if (DENY_DIRS.has(entry.name)) continue;
			await walk(root, absolute, results);
			continue;
		}
		if (!entry.isFile()) continue;
		if (isDeniedPath(relative)) continue;

		const { size } = await stat(absolute);
		if (size === 0 || size > MAX_FILE_BYTES) continue;

		const buffer = await readFile(absolute);
		if (isBinaryBuffer(buffer)) continue;

		results.push({
			path: relative,
			buffer,
			language: detectLanguage(relative),
			sizeBytes: size,
			contentHash: hashContent(buffer),
			isReadme: isReadme(relative),
		});
	}
}
