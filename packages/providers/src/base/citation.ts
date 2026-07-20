import type { ConnectorContext } from './context.js';

/** Source-native context attached to a chat citation (permalink, author, channel, timestamps). */
export interface CitationDetail {
	title?: string;
	permalink?: string;
	author?: string;
	channel?: string;
	timestamp?: string;
	extra?: Record<string, unknown>;
}

/**
 * Enrich a citation whose sourceRef belongs to this provider. Resolution is
 * prefix-based via the registry — the chat layer holds no provider knowledge.
 */
export interface CitationCapable {
	/** True when this provider owns the given sourceRef (e.g. `slack/...`). */
	ownsSourceRef(sourceRef: string): boolean;
	enrichCitation(sourceRef: string, ctx: ConnectorContext): Promise<CitationDetail | null>;
}
