import type { Project } from '@meshify/data-access';
import type { EmbeddingProvider } from '@meshify/embeddings';
import type { QdrantSearchClient, SearchFilters } from '@meshify/vector-store';
import { mergeAndRank, type SearchCollection, type SearchMode, type SearchResultItem, type SearchSource } from '../domain/search-result.js';

/** Builds the query-embedding provider for a project, or throws a typed error the controller maps to a status. */
export interface EmbeddingProviderFactory {
	forProject(project: Project): EmbeddingProvider;
}

/** 'slack' scopes to Slack conversations (which live in the `_documents` collection); 'documents' excludes them. */
export type SearchScope = SearchCollection | 'all' | 'slack';

export interface SearchCommand {
	project: Project;
	query: string;
	mode: SearchMode;
	scope?: SearchScope;
	filters?: SearchFilters;
	limit?: number;
}

export interface SearchResponse {
	query: string;
	mode: SearchMode;
	/** Set when the requested mode could not be served as-asked and was degraded (e.g. hybrid -> semantic). */
	degradedTo?: SearchMode;
	warning?: string;
	results: SearchResultItem[];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const PER_COLLECTION_MULTIPLIER = 2; // over-fetch per collection so the merged top-N is well-ranked

export class SearchUseCase {
	constructor(
		private readonly embeddings: EmbeddingProviderFactory,
		private readonly qdrant: QdrantSearchClient
	) {}

	async execute(command: SearchCommand): Promise<SearchResponse> {
		const limit = Math.min(command.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
		const scope = command.scope ?? 'all';

		// Sparse vectors are provisioned on every collection but never populated
		// at ingest (RocketRide's qdrant node writes dense only), so true
		// keyword/hybrid retrieval isn't available yet. Degrade to semantic and
		// tell the caller rather than silently returning dense results as "hybrid".
		let mode = command.mode;
		let degradedTo: SearchMode | undefined;
		let warning: string | undefined;
		if (mode === 'keyword' || mode === 'hybrid') {
			degradedTo = 'semantic';
			warning = `"${mode}" search is not yet available (sparse vectors are not populated at ingest); served as semantic search.`;
			mode = 'semantic';
		}

		const provider = this.embeddings.forProject(command.project);
		const vector = await provider.embed(command.query);

		const wantDocs = scope === 'all' || scope === 'documents' || scope === 'slack';
		const wantCode = scope === 'all' || scope === 'code';

		// Source scoping (github/documents/slack) is applied AFTER retrieval on the
		// derived source, because Slack shares the _documents collection and
		// RocketRide's meta.parent path is not prefix-indexable in Qdrant. When a
		// scope selects only a subset of a collection (slack ⊂ documents), over-fetch
		// harder so the post-filtered top-N is still well-populated.
		const sources: SearchSource[] | undefined = scope === 'slack' ? ['slack'] : scope === 'documents' ? ['documents'] : undefined;
		const docsMultiplier = scope === 'slack' || scope === 'documents' ? PER_COLLECTION_MULTIPLIER * 3 : PER_COLLECTION_MULTIPLIER;

		const [documentHits, codeHits] = await Promise.all([
			wantDocs ? this.qdrant.search(command.project.qdrantCollectionDocs, vector, { limit: limit * docsMultiplier, filters: command.filters }) : Promise.resolve([]),
			wantCode ? this.qdrant.search(command.project.qdrantCollectionCode, vector, { limit: limit * PER_COLLECTION_MULTIPLIER, filters: command.filters }) : Promise.resolve([]),
		]);

		return {
			query: command.query,
			mode: command.mode,
			degradedTo,
			warning,
			results: mergeAndRank(documentHits, codeHits, limit, sources),
		};
	}
}
