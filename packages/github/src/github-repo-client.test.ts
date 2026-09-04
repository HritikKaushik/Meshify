import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPARE_FILE_CAP, CompareTooLargeError, GitHubRepoClient } from './github-repo-client.js';

/** A stand-in for api.github.com: compare pages of configurable size, and one route that never answers. */
let server: Server;
let base = '';
const pageRequests: string[] = [];

function comparePage(total: number, page: number, per = 100) {
	const start = (page - 1) * per;
	const count = Math.max(0, Math.min(per, total - start));
	return { files: Array.from({ length: count }, (_, i) => ({ filename: `src/file-${start + i}.ts`, status: 'modified' })) };
}

beforeAll(async () => {
	server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const m = url.pathname.match(/\/compare\/(\w+)\.\.\.(\w+)$/);
		if (m) {
			pageRequests.push(url.search);
			const total = Number(m[2]!.replace('head', ''));
			const page = Number(url.searchParams.get('page') ?? '1');
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify(comparePage(total, page)));
			return;
		}
		if (url.pathname === '/repos/o/stall') return; // never answers
		if (url.pathname === '/repos/o/r/tarball/ref') {
			res.setHeader('content-type', 'application/x-gzip');
			// Several chunks, so the client has to stream rather than read one body.
			for (let i = 0; i < 4; i++) res.write(Buffer.alloc(64 * 1024, i));
			res.end();
			return;
		}
		if (url.pathname === '/repos/o/r/tarball/missing') {
			res.statusCode = 404;
			res.end('{"message":"Not Found"}');
			return;
		}
		res.statusCode = 404;
		res.end('{}');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

const auth = { installationToken: async () => 'tok' };

describe('GitHubRepoClient.compare', () => {
	it('walks every page instead of stopping after the first 100 files', async () => {
		pageRequests.length = 0;
		const client = new GitHubRepoClient(auth, base);
		const files = await client.compare('o', 'r', 'basesha', 'head150');
		expect(files).toHaveLength(150);
		expect(files[149]!.path).toBe('src/file-149.ts');
		expect(pageRequests).toEqual(['?per_page=100&page=1', '?per_page=100&page=2']);
	});

	it('returns a single short page without a second request', async () => {
		pageRequests.length = 0;
		const files = await new GitHubRepoClient(auth, base).compare('o', 'r', 'basesha', 'head7');
		expect(files).toHaveLength(7);
		expect(pageRequests).toHaveLength(1);
	});

	it(`refuses a diff that reaches GitHub's ${COMPARE_FILE_CAP}-file ceiling so the caller re-ingests instead of silently losing files`, async () => {
		await expect(new GitHubRepoClient(auth, base).compare('o', 'r', 'basesha', 'head450')).rejects.toBeInstanceOf(CompareTooLargeError);
	});
});

describe('GitHubRepoClient timeouts', () => {
	it('aborts an API call that never answers', async () => {
		const client = new GitHubRepoClient(auth, base, { apiMs: 50 });
		const started = Date.now();
		await expect(client.getHead('o', 'stall')).rejects.toThrow(/timeout|abort/i);
		expect(Date.now() - started).toBeLessThan(2000);
	});
});

describe('GitHubRepoClient.downloadTarballToFile', () => {
	it('streams the archive to the destination path byte for byte', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'meshify-tarball-'));
		try {
			const destination = path.join(dir, 'archive.tar.gz');
			await new GitHubRepoClient(auth, base).downloadTarballToFile('o', 'r', 'ref', destination);
			const written = await readFile(destination);
			expect(written.byteLength).toBe(4 * 64 * 1024);
			expect(written[0]).toBe(0);
			expect(written[written.byteLength - 1]).toBe(3);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('fails with the status when GitHub does not serve the archive', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'meshify-tarball-'));
		try {
			await expect(new GitHubRepoClient(auth, base).downloadTarballToFile('o', 'r', 'missing', path.join(dir, 'x.tar.gz'))).rejects.toThrow(/404/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
