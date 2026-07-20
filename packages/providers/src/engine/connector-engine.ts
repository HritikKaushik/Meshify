import type { KnowledgeItem, KnowledgeSink } from '../base/knowledge.js';
import type { SyncCapable, SyncContext, SyncSummary } from '../base/sync.js';

/**
 * The write side of the knowledge layer, implemented in the worker over
 * RocketRide (embedding) + Qdrant (vectors). The engine is its only caller.
 */
export interface KnowledgeWriter {
	embed(target: 'documents' | 'code', items: KnowledgeItem[]): Promise<void>;
	deleteBySourceRefs(target: 'documents' | 'code', sourceRefs: string[]): Promise<void>;
}

/**
 * Content-hash memory per connector — the engine's change detector. Backed by
 * the provider detail tables today (files.content_hash, slack_conversations.
 * content_hash) and by a generic store for new providers.
 */
export interface ContentLedger {
	getHashes(connectorId: string, sourceRefs: string[]): Promise<Map<string, string>>;
	setHashes(connectorId: string, entries: Array<{ sourceRef: string; contentHash: string; target: 'documents' | 'code' }>): Promise<void>;
	deleteRefs(connectorId: string, sourceRefs: string[]): Promise<void>;
}

export interface EngineProgress {
	(stage: string, percent?: number): void;
}

const DEFAULT_BATCH_SIZE = 25;

/**
 * The Connector Engine — the layer between providers and the knowledge layer.
 * Providers never touch the writer: the engine hands them a sink and behind it
 * owns change detection (hash skip), purge-before-reingest ordering (stale
 * vectors are deleted before re-embedding, so retries and updates never
 * duplicate points), batching, scope-failure aggregation, and the summary.
 *
 *   Provider.executeSync(ctx, sink) → ConnectorEngine → KnowledgeWriter → vectors
 */
export class ConnectorEngine {
	constructor(
		private readonly writer: KnowledgeWriter,
		private readonly ledger: ContentLedger,
		private readonly opts: { batchSize?: number } = {}
	) {}

	async execute(provider: SyncCapable, ctx: SyncContext, progress?: EngineProgress): Promise<SyncSummary> {
		const summary: SyncSummary = { itemsUpserted: 0, itemsRemoved: 0, itemsSkipped: 0, partialFailures: [] };
		const batchSize = this.opts.batchSize ?? DEFAULT_BATCH_SIZE;
		const connectorId = ctx.connector.id;
		let buffer: KnowledgeItem[] = [];

		const flush = async (): Promise<void> => {
			if (buffer.length === 0) return;
			const batch = buffer;
			buffer = [];

			const known = await this.ledger.getHashes(connectorId, batch.map((i) => i.sourceRef));
			const changed = batch.filter((item) => known.get(item.sourceRef) !== item.contentHash);
			summary.itemsSkipped += batch.length - changed.length;
			if (changed.length === 0) return;

			for (const target of ['documents', 'code'] as const) {
				const forTarget = changed.filter((i) => i.target === target);
				if (forTarget.length === 0) continue;
				// Purge EVERY ref in the batch before re-embedding, not just the
				// ledger-known subset. `writer.embed` (RocketRide) appends, so a
				// retry after "embed succeeded but the ledger stamp failed" would
				// duplicate points for a ref the ledger still thinks is new. A
				// delete of an absent ref is a no-op, so purging all is safe and
				// makes retries idempotent regardless of where the last attempt died.
				await this.writer.deleteBySourceRefs(target, forTarget.map((i) => i.sourceRef));
				await this.writer.embed(target, forTarget);
				await this.ledger.setHashes(
					connectorId,
					forTarget.map((i) => ({ sourceRef: i.sourceRef, contentHash: i.contentHash, target }))
				);
				summary.itemsUpserted += forTarget.length;
			}
		};

		const sink: KnowledgeSink = {
			upsert: async (items) => {
				for (const item of items) {
					buffer.push(item);
					if (buffer.length >= batchSize) await flush();
				}
			},
			flush,
			remove: async (sourceRefs) => {
				if (sourceRefs.length === 0) return;
				await flush(); // preserve upsert→remove ordering
				// Removal targets both collections defensively — refs are unique
				// across targets, so the extra delete is a no-op.
				await this.writer.deleteBySourceRefs('documents', sourceRefs);
				await this.writer.deleteBySourceRefs('code', sourceRefs);
				await this.ledger.deleteRefs(connectorId, sourceRefs);
				summary.itemsRemoved += sourceRefs.length;
			},
			progress: (stage, percent) => progress?.(stage, percent),
			scopeFailed: (scope, error) => {
				summary.partialFailures.push({ scope, error });
			},
		};

		await provider.executeSync(ctx, sink);
		await flush();
		return summary;
	}
}
