import type { ConnectorContext } from './context.js';
import type { KnowledgeSink } from './knowledge.js';

export type SyncMode = 'full' | 'incremental';

/** Provider-defined cursor persistence, scoped to the connector being synced. */
export interface CursorStore {
	get(scopeKey: string): Promise<Record<string, unknown> | undefined>;
	set(scopeKey: string, cursor: Record<string, unknown>): Promise<void>;
}

export interface SyncContext extends ConnectorContext {
	mode: SyncMode;
	cursors: CursorStore;
}

export interface SyncSummary {
	itemsUpserted: number;
	itemsRemoved: number;
	itemsSkipped: number;
	/** Scopes that failed without failing the whole sync (e.g. a channel the bot left). */
	partialFailures: Array<{ scope: string; error: string }>;
}

/**
 * Content synchronization. Providers decide what to fetch and how it maps to
 * KnowledgeItems; the engine executing this owns retries, idempotency
 * (hash-skip + purge-before-reingest), progress, and job lifecycle. A sync
 * MUST be re-run-safe: re-executing after a partial failure converges.
 */
export interface SyncCapable {
	executeSync(ctx: SyncContext, sink: KnowledgeSink): Promise<SyncSummary>;
}
