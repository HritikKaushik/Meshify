import type { QdrantSearchHit } from '@meshify/vector-store';

export type SearchMode = 'semantic' | 'keyword' | 'hybrid';
export type SearchCollection = 'documents' | 'code';

export interface SearchResultItem {
	id: string;
	collection: SearchCollection;
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
 * (`meta.isDeleted === true`), which must never surface as a search result.
 */
function hitToItem(hit: QdrantSearchHit, collection: SearchCollection): SearchResultItem | null {
	const payload = hit.payload;
	const meta = (typeof payload.meta === 'object' && payload.meta !== null ? payload.meta : {}) as RocketRideMeta;
	if (meta.isDeleted === true) return null;
	return {
		id: hit.id,
		collection,
		sourcePath: typeof meta.parent === 'string' ? meta.parent : 'unknown',
		score: hit.score,
		content: typeof payload.content === 'string' ? payload.content : null,
		chunkIndex: typeof meta.chunkId === 'number' ? meta.chunkId : null,
	};
}

/**
 * Merges hits from the documents and code collections into one ranking.
 * Both collections use the same embedding model, so cosine scores are directly
 * comparable — a plain score-descending sort is the correct fusion here.
 */
export function mergeAndRank(documentHits: QdrantSearchHit[], codeHits: QdrantSearchHit[], limit: number): SearchResultItem[] {
	const merged = [
		...documentHits.map((h) => hitToItem(h, 'documents')),
		...codeHits.map((h) => hitToItem(h, 'code')),
	].filter((item): item is SearchResultItem => item !== null);
	merged.sort((a, b) => b.score - a.score);
	return merged.slice(0, limit);
}
