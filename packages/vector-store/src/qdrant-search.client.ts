/**
 * Direct Qdrant retrieval for the /search endpoint. RocketRide's qdrant
 * component only takes collection/host/port/score — it has no metadata-filter
 * input and cannot query sparse vectors — so search that supports the required
 * metadata filters must go straight to Qdrant's Query API, not through a
 * RocketRide pipeline.
 */

export interface SearchFilters {
	/** payload.language exact match (e.g. "typescript", "markdown"). */
	language?: string;
	/** payload.parent_type exact match ("document" | "file"). */
	parentType?: 'document' | 'file';
	/** payload.source_path prefix (e.g. "src/"). */
	sourcePathPrefix?: string;
}

export interface QdrantSearchHit {
	id: string;
	score: number;
	payload: Record<string, unknown>;
}

/** Builds a Qdrant filter object from metadata filters, or undefined when none apply. */
export function buildQdrantFilter(filters: SearchFilters): Record<string, unknown> | undefined {
	const must: Array<Record<string, unknown>> = [];
	if (filters.language) must.push({ key: 'language', match: { value: filters.language } });
	if (filters.parentType) must.push({ key: 'parent_type', match: { value: filters.parentType } });
	if (filters.sourcePathPrefix) must.push({ key: 'source_path', match: { text: filters.sourcePathPrefix } });
	return must.length > 0 ? { must } : undefined;
}

export class QdrantSearchClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey?: string
	) {}

	async search(collection: string, vector: number[], options: { limit: number; scoreThreshold?: number; filters?: SearchFilters }): Promise<QdrantSearchHit[]> {
		const res = await fetch(new URL(`/collections/${collection}/points/search`, this.baseUrl), {
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({
				vector,
				limit: options.limit,
				with_payload: true,
				score_threshold: options.scoreThreshold,
				filter: options.filters ? buildQdrantFilter(options.filters) : undefined,
			}),
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok) {
			// A missing collection (project has no code/docs yet) is an empty result, not an error.
			if (res.status === 404) return [];
			throw new Error(`Qdrant search on "${collection}" failed: ${res.status} ${await res.text()}`);
		}

		const body = (await res.json()) as { result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> };
		return (body.result ?? []).map((hit) => ({ id: String(hit.id), score: hit.score, payload: hit.payload ?? {} }));
	}

	private headers(): Record<string, string> {
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (this.apiKey) headers['api-key'] = this.apiKey;
		return headers;
	}
}
