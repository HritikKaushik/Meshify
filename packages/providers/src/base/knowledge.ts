/**
 * The normalization boundary: every provider's content enters the knowledge
 * layer as KnowledgeItems through a KnowledgeSink. Retrieval, chat, and search
 * consume only what passed through here — the AI layer never sees a provider.
 */
export interface KnowledgeItem {
	/**
	 * Stable, unique address of the item within its project. New providers use
	 * `<provider>/<account>/<resource>/<item>`; legacy GitHub file paths and
	 * `slack/...` paths are grandfathered.
	 */
	sourceRef: string;
	/** Which per-project vector collection the item belongs to. */
	target: 'documents' | 'code';
	content: Buffer | string;
	mimeType?: string;
	title?: string;
	/** Content hash for change detection — unchanged items are skipped by the engine. */
	contentHash: string;
	metadata?: Record<string, unknown>;
}

/**
 * The only door into the knowledge layer during a sync. Handed to providers by
 * the ConnectorEngine, which owns batching, hash-skip, purge-before-reingest,
 * embedding, and progress fan-out — providers just push normalized items and
 * report scope-level failures (a channel the bot left, an unreadable drive).
 */
export interface KnowledgeSink {
	upsert(items: KnowledgeItem[]): Promise<void>;
	remove(sourceRefs: string[]): Promise<void>;
	/**
	 * Barrier: force buffered items through the writer. Call before committing
	 * a cursor — a cursor must never advance past content that has not been
	 * durably embedded (a failed tail-flush after an advanced cursor would
	 * silently skip that content on retry).
	 */
	flush(): Promise<void>;
	progress(stage: string, percent?: number): void;
	/** Record a non-fatal per-scope failure; the sync continues and the engine aggregates these into the summary. */
	scopeFailed(scope: string, error: string): void;
}
