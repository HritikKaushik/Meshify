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
	/** payload.meta.parent prefix (e.g. "src/", "slack/") — scopes results TO a source family (needs a full-text index). */
	sourcePathPrefix?: string;
	/** payload.meta.parent prefix to EXCLUDE (e.g. "slack/") — a must_not (needs a full-text index). */
	sourcePathPrefixNot?: string;
	/** payload.meta.parent exact match (e.g. "refund-runbook.md") — used for targeted deletion. */
	sourcePathExact?: string;
}

// RocketRide stores each chunk's source path at payload.meta.parent (see search-result.ts and the
// collection provisioner) — NOT a top-level source_path — so every filter/delete keys on `meta.parent`.
const SOURCE_PATH_KEY = 'meta.parent';

export interface QdrantSearchHit {
	id: string;
	score: number;
	payload: Record<string, unknown>;
}

/** Builds a Qdrant filter object from metadata filters, or undefined when none apply. */
export function buildQdrantFilter(filters: SearchFilters): Record<string, unknown> | undefined {
	const must: Array<Record<string, unknown>> = [];
	const mustNot: Array<Record<string, unknown>> = [];
	if (filters.language) must.push({ key: 'language', match: { value: filters.language } });
	if (filters.parentType) must.push({ key: 'parent_type', match: { value: filters.parentType } });
	if (filters.sourcePathPrefix) must.push({ key: SOURCE_PATH_KEY, match: { text: filters.sourcePathPrefix } });
	if (filters.sourcePathExact) must.push({ key: SOURCE_PATH_KEY, match: { value: filters.sourcePathExact } });
	if (filters.sourcePathPrefixNot) mustNot.push({ key: SOURCE_PATH_KEY, match: { text: filters.sourcePathPrefixNot } });
	if (must.length === 0 && mustNot.length === 0) return undefined;
	return { ...(must.length > 0 ? { must } : {}), ...(mustNot.length > 0 ? { must_not: mustNot } : {}) };
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

	/**
	 * Deletes every point in a collection whose payload matches the filter —
	 * used to purge a document's chunks when it is removed. Tolerates a missing
	 * collection (404) as a no-op: a document that was never embedded has no
	 * points to delete. Other failures throw so the caller can decide.
	 */
	async deleteByFilter(collection: string, filters: SearchFilters): Promise<void> {
		const filter = buildQdrantFilter(filters);
		if (!filter) throw new Error('deleteByFilter requires at least one filter — refusing to delete an entire collection');

		const res = await fetch(new URL(`/collections/${collection}/points/delete`, this.baseUrl), {
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({ filter }),
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok && res.status !== 404) {
			throw new Error(`Qdrant delete on "${collection}" failed: ${res.status} ${await res.text()}`);
		}
	}

	/**
	 * Deletes every point whose payload.meta.parent is one of `paths`, batching
	 * into OR-filtered delete requests. Used to purge a repository's embedded
	 * code chunks (keyed by file path) or a Slack conversation's chunks from a
	 * project's collection. A missing collection (404) is a no-op; empty input
	 * does nothing. Other failures throw so the caller can decide.
	 */
	async deleteBySourcePaths(collection: string, paths: string[], batchSize = 256): Promise<void> {
		for (let i = 0; i < paths.length; i += batchSize) {
			const batch = paths.slice(i, i + batchSize);
			const filter = { should: batch.map((p) => ({ key: SOURCE_PATH_KEY, match: { value: p } })) };
			const res = await fetch(new URL(`/collections/${collection}/points/delete`, this.baseUrl), {
				method: 'POST',
				headers: this.headers(),
				body: JSON.stringify({ filter }),
				signal: AbortSignal.timeout(15_000),
			});
			if (!res.ok && res.status !== 404) {
				throw new Error(`Qdrant delete on "${collection}" failed: ${res.status} ${await res.text()}`);
			}
			if (res.status === 404) return; // collection absent — nothing embedded yet
		}
	}

	private headers(): Record<string, string> {
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (this.apiKey) headers['api-key'] = this.apiKey;
		return headers;
	}
}
