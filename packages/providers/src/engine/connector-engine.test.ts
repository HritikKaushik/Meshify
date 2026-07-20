import { describe, expect, it } from 'vitest';
import { ConnectorEngine } from './connector-engine.js';
import type { ContentLedger, KnowledgeWriter } from './connector-engine.js';
import type { KnowledgeItem } from '../base/knowledge.js';
import type { SyncCapable, SyncContext } from '../base/sync.js';
import { buildIntegration, fakeVaultHandle, fakeRegistration } from '../testing/fakes.js';

class RecordingWriter implements KnowledgeWriter {
	calls: Array<{ op: 'embed' | 'delete'; target: string; refs: string[] }> = [];

	async embed(target: 'documents' | 'code', items: KnowledgeItem[]): Promise<void> {
		this.calls.push({ op: 'embed', target, refs: items.map((i) => i.sourceRef) });
	}

	async deleteBySourceRefs(target: 'documents' | 'code', sourceRefs: string[]): Promise<void> {
		this.calls.push({ op: 'delete', target, refs: sourceRefs });
	}
}

class MapLedger implements ContentLedger {
	constructor(readonly hashes = new Map<string, string>()) {}

	async getHashes(_connectorId: string, sourceRefs: string[]): Promise<Map<string, string>> {
		const out = new Map<string, string>();
		for (const ref of sourceRefs) {
			const hash = this.hashes.get(ref);
			if (hash) out.set(ref, hash);
		}
		return out;
	}

	async setHashes(_connectorId: string, entries: Array<{ sourceRef: string; contentHash: string }>): Promise<void> {
		for (const e of entries) this.hashes.set(e.sourceRef, e.contentHash);
	}

	async deleteRefs(_connectorId: string, sourceRefs: string[]): Promise<void> {
		for (const ref of sourceRefs) this.hashes.delete(ref);
	}
}

function item(sourceRef: string, contentHash: string, target: 'documents' | 'code' = 'code'): KnowledgeItem {
	return { sourceRef, target, content: `content of ${sourceRef}`, contentHash };
}

function syncCtx(): SyncContext {
	return {
		mode: 'incremental',
		integration: buildIntegration(),
		vault: fakeVaultHandle(),
		registration: fakeRegistration(),
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

function providerPushing(...batches: Array<{ upsert?: KnowledgeItem[]; remove?: string[]; failScope?: [string, string] }>): SyncCapable {
	return {
		async executeSync(_ctx, sink) {
			for (const batch of batches) {
				if (batch.upsert) await sink.upsert(batch.upsert);
				if (batch.remove) await sink.remove(batch.remove);
				if (batch.failScope) sink.scopeFailed(...batch.failScope);
			}
		},
	};
}

describe('ConnectorEngine', () => {
	it('embeds new items, skips unchanged ones, and purges before re-embedding changed ones', async () => {
		const writer = new RecordingWriter();
		const ledger = new MapLedger(new Map([['a.ts', 'hash-old'], ['b.ts', 'hash-same']]));
		const engine = new ConnectorEngine(writer, ledger);

		const summary = await engine.execute(
			providerPushing({ upsert: [item('a.ts', 'hash-NEW'), item('b.ts', 'hash-same'), item('c.ts', 'hash-c')] }),
			syncCtx()
		);

		expect(summary).toMatchObject({ itemsUpserted: 2, itemsSkipped: 1, itemsRemoved: 0 });
		// a.ts was previously embedded → purged before the batch embeds; c.ts is new → no purge.
		expect(writer.calls).toEqual([
			{ op: 'delete', target: 'code', refs: ['a.ts'] },
			{ op: 'embed', target: 'code', refs: ['a.ts', 'c.ts'] },
		]);
		expect(ledger.hashes.get('a.ts')).toBe('hash-NEW');
		expect(ledger.hashes.get('c.ts')).toBe('hash-c');
	});

	it('re-running an identical sync is a no-op (idempotency)', async () => {
		const writer = new RecordingWriter();
		const ledger = new MapLedger();
		const engine = new ConnectorEngine(writer, ledger);
		const provider = providerPushing({ upsert: [item('a.ts', 'h1'), item('b.ts', 'h2')] });

		await engine.execute(provider, syncCtx());
		writer.calls = [];
		const second = await engine.execute(provider, syncCtx());

		expect(second).toMatchObject({ itemsUpserted: 0, itemsSkipped: 2 });
		expect(writer.calls).toEqual([]);
	});

	it('routes removals to both targets, clears the ledger, and preserves upsert→remove ordering', async () => {
		const writer = new RecordingWriter();
		const ledger = new MapLedger(new Map([['gone.md', 'h']]));
		const engine = new ConnectorEngine(writer, ledger);

		const summary = await engine.execute(
			providerPushing({ upsert: [item('new.md', 'h-new', 'documents')] }, { remove: ['gone.md'] }),
			syncCtx()
		);

		expect(summary).toMatchObject({ itemsUpserted: 1, itemsRemoved: 1 });
		expect(writer.calls).toEqual([
			{ op: 'embed', target: 'documents', refs: ['new.md'] },
			{ op: 'delete', target: 'documents', refs: ['gone.md'] },
			{ op: 'delete', target: 'code', refs: ['gone.md'] },
		]);
		expect(ledger.hashes.has('gone.md')).toBe(false);
	});

	it('batches large upserts and aggregates scope failures without failing the sync', async () => {
		const writer = new RecordingWriter();
		const engine = new ConnectorEngine(writer, new MapLedger(), { batchSize: 2 });

		const summary = await engine.execute(
			providerPushing(
				{ upsert: [item('1', 'h1'), item('2', 'h2'), item('3', 'h3'), item('4', 'h4'), item('5', 'h5')] },
				{ failScope: ['#ops', 'not_in_channel'] }
			),
			syncCtx()
		);

		expect(summary.itemsUpserted).toBe(5);
		expect(summary.partialFailures).toEqual([{ scope: '#ops', error: 'not_in_channel' }]);
		expect(writer.calls.filter((c) => c.op === 'embed').map((c) => c.refs.length)).toEqual([2, 2, 1]);
	});

	it('splits mixed-target batches per collection', async () => {
		const writer = new RecordingWriter();
		const engine = new ConnectorEngine(writer, new MapLedger());

		await engine.execute(
			providerPushing({ upsert: [item('doc.md', 'h1', 'documents'), item('code.ts', 'h2', 'code')] }),
			syncCtx()
		);

		expect(writer.calls).toEqual([
			{ op: 'embed', target: 'documents', refs: ['doc.md'] },
			{ op: 'embed', target: 'code', refs: ['code.ts'] },
		]);
	});
});
