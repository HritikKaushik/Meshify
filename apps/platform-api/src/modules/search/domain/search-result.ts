import type { QdrantSearchHit } from '@meshify/vector-store';

export type SearchMode = 'semantic' | 'keyword' | 'hybrid';
export type SearchCollection = 'documents' | 'code';

export interface SearchResultItem {
	id: string;
	collection: SearchCollection;
	sourcePath: string;
	score: number;
	language: string | null;
	parentType: string | null;
	chunkIndex: number | null;
}

function hitToItem(hit: QdrantSearchHit, collection: SearchCollection): SearchResultItem {
	const payload = hit.payload;
	return {
		id: hit.id,
		collection,
		sourcePath: typeof payload.source_path === 'string' ? payload.source_path : 'unknown',
		score: hit.score,
		language: typeof payload.language === 'string' ? payload.language : null,
		parentType: typeof payload.parent_type === 'string' ? payload.parent_type : null,
		chunkIndex: typeof payload.chunk_index === 'number' ? payload.chunk_index : null,
	};
}

/**
 * Merges hits from the documents and code collections into one ranking.
 * Both collections use the same embedding model, so cosine scores are directly
 * comparable — a plain score-descending sort is the correct fusion here.
 */
export function mergeAndRank(documentHits: QdrantSearchHit[], codeHits: QdrantSearchHit[], limit: number): SearchResultItem[] {
	const merged = [...documentHits.map((h) => hitToItem(h, 'documents')), ...codeHits.map((h) => hitToItem(h, 'code'))];
	merged.sort((a, b) => b.score - a.score);
	return merged.slice(0, limit);
}
