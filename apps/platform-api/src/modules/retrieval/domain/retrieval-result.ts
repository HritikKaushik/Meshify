import type { QdrantSearchHit } from '@meshify/vector-store';

export type RetrievalCollection = 'documents' | 'code';
/** The knowledge source a result came from — distinguishes GitHub, Documents, and Slack even though the last two share the `_documents` collection. */
export type RetrievalSource = 'github' | 'documents' | 'slack';

export interface RetrievalResultItem {
	id: string;
	collection: RetrievalCollection;
	source: RetrievalSource;
	sourcePath: string;
	score: number;
	/** Chunk text (RocketRide stores it in the point payload). */
	content: string | null;
	chunkIndex: number | null;
}

/** Metadata RocketRide writes under `payload.meta` for every stored chunk. */
interface RocketRideMeta {
	parent?: string;
	chunkId?: number;
	objectId?: string;
	isDeleted?: boolean;
}

/**
 * Maps a Qdrant hit (RocketRide's payload shape: `content` + `meta`) to a
 * result item. Returns null for RocketRide's schema/control document
 * (`meta.isDeleted === true`), which must never surface as a retrieval result.
 */
function hitToItem(hit: QdrantSearchHit, collection: RetrievalCollection): RetrievalResultItem | null {
	const payload = hit.payload;
	const meta = (typeof payload.meta === 'object' && payload.meta !== null ? payload.meta : {}) as RocketRideMeta;
	if (meta.isDeleted === true) return null;
	const sourcePath = typeof meta.parent === 'string' ? meta.parent : 'unknown';
	return {
		id: hit.id,
		collection,
		source: sourceFor(collection, sourcePath),
		sourcePath,
		score: hit.score,
		content: typeof payload.content === 'string' ? payload.content : null,
		chunkIndex: typeof meta.chunkId === 'number' ? meta.chunkId : null,
	};
}

/** Distinguishes the source from the collection + source_path convention: code=GitHub, `slack/…`=Slack, else Documents. */
function sourceFor(collection: RetrievalCollection, sourcePath: string): RetrievalSource {
	if (collection === 'code') return 'github';
	return sourcePath.startsWith('slack/') ? 'slack' : 'documents';
}

/**
 * Merges hits from the documents and code collections into one ranking.
 * Both collections use the same embedding model, so cosine scores are directly
 * comparable — a plain score-descending sort is the correct fusion here.
 *
 * `sources`, when provided, keeps only results from those knowledge sources
 * BEFORE truncating to `limit`. Slack conversations share the `_documents`
 * collection with uploaded docs, so source scoping (github/documents/slack) is
 * applied here on the derived `source` — not via a Qdrant payload filter, since
 * RocketRide writes the path only at meta.parent with no index to prefix-match.
 */
export function mergeAndRank(documentHits: QdrantSearchHit[], codeHits: QdrantSearchHit[], limit: number, sources?: RetrievalSource[]): RetrievalResultItem[] {
	const allowed = sources ? new Set(sources) : undefined;
	const merged = [
		...documentHits.map((h) => hitToItem(h, 'documents')),
		...codeHits.map((h) => hitToItem(h, 'code')),
	].filter((item): item is RetrievalResultItem => item !== null && (!allowed || allowed.has(item.source)));
	merged.sort((a, b) => b.score - a.score);
	return merged.slice(0, limit);
}
