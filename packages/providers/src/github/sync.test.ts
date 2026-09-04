import { describe, expect, it } from 'vitest';
import { CompareTooLargeError } from '@meshify/github';
import { createHash } from 'node:crypto';
import { executeGitHubSync, type GitHubRepoTransport, type GitHubSyncDeps } from './sync.js';
import type { ScannedFile } from './archive/repo-scanner.js';
import { ConnectorEngine, type ContentLedger, type KnowledgeItem, type KnowledgeWriter, type SyncContext } from '../index.js';
import { buildIntegration, fakeVaultHandle, fakeRegistration } from '../testing/fakes.js';
import type { Repository } from '@meshify/data-access';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

class RecordingWriter implements KnowledgeWriter {
	embedded: string[] = [];
	deleted: string[] = [];
	async embed(_t: 'documents' | 'code', items: KnowledgeItem[]) {
		this.embedded.push(...items.map((i) => i.sourceRef));
	}
	async deleteBySourceRefs(_t: 'documents' | 'code', refs: string[]) {
		this.deleted.push(...refs);
	}
}

class MapLedger implements ContentLedger {
	constructor(readonly hashes = new Map<string, string>()) {}
	async getHashes(_c: string, refs: string[]) {
		return new Map([...this.hashes].filter(([k]) => refs.includes(k)));
	}
	async setHashes(_c: string, entries: Array<{ sourceRef: string; contentHash: string }>) {
		for (const e of entries) this.hashes.set(e.sourceRef, e.contentHash);
	}
	async deleteRefs(_c: string, refs: string[]) {
		for (const r of refs) this.hashes.delete(r);
	}
}

function repoRow(overrides: Partial<Repository> = {}): Repository {
	return {
		id: 'repo-1',
		projectId: 'proj-1',
		connectorId: 'conn-1',
		source: 'github',
		remoteUrl: 'https://github.com/acme/api',
		defaultBranch: 'main',
		lastSyncedCommit: 'oldsha',
		syncStatus: 'synced',
		archiveObjectKey: null,
		githubRepoId: '42',
		owner: 'acme',
		name: 'api',
		lastSyncedAt: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	};
}

function syncCtx(mode: 'full' | 'incremental'): SyncContext {
	return {
		mode,
		integration: buildIntegration({ externalAccountId: '12345' }),
		vault: fakeVaultHandle(),
		registration: fakeRegistration({ provider: 'github' }),
		connector: {
			id: 'conn-1',
			projectId: 'proj-1',
			type: 'github',
			displayName: 'acme/api',
			status: 'active',
			config: {},
			integrationId: 'int-1',
			syncPolicy: { trigger: 'event' },
			lastError: null,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		},
		cursors: { get: async () => undefined, set: async () => undefined },
	};
}

function scannedFile(path: string, content: string, language: string | null, isReadme = false): ScannedFile {
	return { path, language, sizeBytes: content.length, contentHash: sha(content), isReadme, read: async () => Buffer.from(content) };
}

function harness(opts: {
	repo?: Repository;
	transport: Partial<GitHubRepoTransport>;
	/** A fake tree: the scanned files `materializeTree` hands to the sync. */
	tree?: ScannedFile[];
	ledgerSeed?: Map<string, string>;
	listByRepository?: NonNullable<GitHubSyncDeps['files']['listByRepository']>;
}) {
	const repo = opts.repo ?? repoRow();
	const calls = { markSynced: [] as Array<[string | null, string | null]>, status: [] as string[], filesUpserted: [] as string[], filesDeleted: [] as string[][] };
	const deps: GitHubSyncDeps = {
		repos: {
			findByConnectorId: async () => repo,
			updateSyncStatus: async (_id, status) => void calls.status.push(status),
			markSynced: async (_id, commit, branch) => void calls.markSynced.push([commit, branch]),
			updateGitHubIdentity: async () => undefined,
		},
		files: {
			upsert: async (input) => void calls.filesUpserted.push(input.path),
			upsertMany: async (inputs) => void calls.filesUpserted.push(...inputs.map((input) => input.path)),
			markDeleted: async (_id, paths) => void calls.filesDeleted.push(paths),
			listByRepository: opts.listByRepository,
		},
		repoTransport: () => ({
			getHead: async () => ({ defaultBranch: 'main', headSha: 'newsha' }),
			downloadTarballToFile: async () => undefined,
			compare: async () => [],
			getFileContent: async () => Buffer.from(''),
			...opts.transport,
		}),
		materializeTree: opts.tree ? async (_download, use) => use(opts.tree!) : undefined,
		generateId: () => 'id-x',
	};
	const writer = new RecordingWriter();
	const ledger = new MapLedger(opts.ledgerSeed);
	const engine = new ConnectorEngine(writer, ledger);
	return { deps, writer, ledger, engine, calls };
}

const provider = (deps: GitHubSyncDeps) => ({ executeSync: (ctx: SyncContext, sink: never) => executeGitHubSync(deps, ctx, sink) });

describe('executeGitHubSync', () => {
	it('full sync: scans, records file rows, embeds everything, commits the cursor after the flush barrier', async () => {
		const h = harness({
			transport: {},
			tree: [scannedFile('src/a.ts', 'aaa', 'typescript'), scannedFile('README.md', 'docs', null, true)],
		});
		const summary = await h.engine.execute(provider(h.deps) as never, syncCtx('full'));

		expect(summary).toMatchObject({ itemsUpserted: 2, itemsRemoved: 0, itemsSkipped: 0 });
		expect(h.calls.filesUpserted).toEqual(['src/a.ts', 'README.md']);
		expect(h.writer.embedded).toEqual(['src/a.ts', 'README.md']);
		expect(h.calls.status).toEqual(['cloning']);
		expect(h.calls.markSynced).toEqual([['newsha', 'main']]);
	});

	it('incremental: purges removed+renamed-from vectors, re-embeds changed files, skips unfetchable and binary content', async () => {
		const h = harness({
			ledgerSeed: new Map([['src/old.ts', sha('old')]]),
			transport: {
				compare: async () => [
					{ path: 'src/gone.ts', status: 'removed' },
					{ path: 'src/renamed-to.ts', status: 'renamed', previousPath: 'src/renamed-from.ts' },
					{ path: 'src/old.ts', status: 'modified' },
					{ path: 'huge.bin', status: 'added' },
					{ path: 'binary.dat', status: 'added' },
					{ path: 'node_modules/x.js', status: 'added' },
				],
				getFileContent: async (_o, _r, path) => {
					if (path === 'huge.bin') throw new Error('too large');
					if (path === 'binary.dat') return Buffer.from([0x00, 0x01, 0x02]);
					return Buffer.from(`new content of ${path}`);
				},
			},
		});
		const summary = await h.engine.execute(provider(h.deps) as never, syncCtx('incremental'));

		// Removed + renamed-from purged from vectors AND files marked deleted.
		expect(h.writer.deleted).toEqual(expect.arrayContaining(['src/gone.ts', 'src/renamed-from.ts', 'src/old.ts']));
		expect(h.calls.filesDeleted).toEqual([['src/gone.ts', 'src/renamed-from.ts']]);
		// old.ts changed: purged before re-embed (no duplicate points); renamed-to embedded fresh.
		expect(h.writer.embedded).toEqual(['src/renamed-to.ts', 'src/old.ts']);
		expect(summary.itemsRemoved).toBe(2);
		expect(summary.itemsUpserted).toBe(2);
		expect(h.calls.markSynced).toEqual([['newsha', 'main']]);
	});

	it('incremental: falls back to a full re-ingest when the GitHub diff is truncated, retiring files that left the tree', async () => {
		const h = harness({
			transport: {
				compare: async () => {
					throw new CompareTooLargeError('oldsha', 'newsha', 300);
				},
			},
			tree: [scannedFile('src/a.ts', 'aaa', 'typescript')],
			listByRepository: async () => [
				{ path: 'src/a.ts', status: 'embedded' },
				{ path: 'src/stale.ts', status: 'embedded' },
				{ path: 'src/already-gone.ts', status: 'deleted' },
			],
		});
		const summary = await h.engine.execute(provider(h.deps) as never, syncCtx('incremental'));

		expect(h.writer.embedded).toEqual(['src/a.ts']);
		expect(h.calls.filesDeleted).toEqual([['src/stale.ts']]);
		expect(h.writer.deleted).toContain('src/stale.ts');
		expect(summary.itemsUpserted).toBe(1);
		// The cursor advanced to the new head only because the whole tree was re-ingested.
		expect(h.calls.markSynced).toEqual([['newsha', 'main']]);
	});

	it('incremental with unchanged head is a fast no-op that still refreshes sync state', async () => {
		const h = harness({ transport: { getHead: async () => ({ defaultBranch: 'main', headSha: 'oldsha' }) } });
		const summary = await h.engine.execute(provider(h.deps) as never, syncCtx('incremental'));
		expect(summary).toMatchObject({ itemsUpserted: 0, itemsRemoved: 0 });
		expect(h.writer.embedded).toEqual([]);
		expect(h.calls.markSynced).toEqual([['oldsha', 'main']]);
	});

	it('refuses incremental sync before a completed full ingest', async () => {
		const h = harness({ repo: repoRow({ lastSyncedCommit: null }), transport: {} });
		await expect(h.engine.execute(provider(h.deps) as never, syncCtx('incremental'))).rejects.toThrow(/full ingest/);
	});
});
