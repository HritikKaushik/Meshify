import type { Project } from '@meshify/data-access';
import type { QdrantSearchClient, QdrantSearchHit } from '@meshify/vector-store';
import type { EmbeddingProviderFactory } from '../../retrieval/application/embedding-provider.port.js';
import { hybridRank } from '../../retrieval/domain/hybrid-rank.js';
import { mergeAndRank } from '../../retrieval/domain/retrieval-result.js';
import type { ChatContextRetriever, RetrieveOptions } from '../application/chat-context-retriever.port.js';
import type { RetrievedChunk } from '../domain/build-rag-prompt.js';
import { buildRetrievalQueries } from '../domain/retrieval-query.js';

/** Top-N context chunks handed to the LLM per chat turn — small enough that the model reliably grounds on all of them (see chat-pipeline.ts for why RocketRide's own retrieval had no such cap). */
const CONTEXT_LIMIT = 8;
/** Candidates fetched per collection per query before re-ranking; the lexical pass needs a wider net than the final N. */
const PER_COLLECTION_MULTIPLIER = 3;

export interface RetrieverOptions {
	/** Cosine similarity below which a chunk is never used as context (RAG_MIN_SCORE). */
	minScore: number;
}

/**
 * Reuses the exact retrieval path `/search` already uses (same embedding
 * provider, same direct Qdrant REST client, same RocketRide payload mapping)
 * so chat and search never disagree about what a project's real content is.
 *
 * On top of that: a similarity floor (a chunk that is merely the least
 * unrelated thing in the project is worse than no context, which the prompt
 * then says honestly), a second query carrying the previous turn's subject
 * for follow-up questions, and a lexical re-rank so exact identifiers and
 * error strings win over topically similar prose.
 */
export class VectorSearchContextRetriever implements ChatContextRetriever {
	constructor(
		private readonly embeddings: EmbeddingProviderFactory,
		private readonly qdrant: QdrantSearchClient,
		private readonly options: RetrieverOptions
	) {}

	async retrieve(project: Project, query: string, options: RetrieveOptions = {}): Promise<RetrievedChunk[]> {
		const provider = this.embeddings.forProject(project);
		const queries = buildRetrievalQueries(query, options.history);
		const perCollectionLimit = CONTEXT_LIMIT * PER_COLLECTION_MULTIPLIER;
		const searchOptions = { limit: perCollectionLimit, scoreThreshold: this.options.minScore };

		const perQuery = await Promise.all(
			queries.map(async (q) => {
				const vector = await provider.embed(q);
				return Promise.all([this.qdrant.search(project.qdrantCollectionDocs, vector, searchOptions), this.qdrant.search(project.qdrantCollectionCode, vector, searchOptions)]);
			})
		);

		// Union across queries, keeping each chunk's best score, then merge the two collections.
		const documentHits = dedupeHits(perQuery.map(([docs]) => docs));
		const codeHits = dedupeHits(perQuery.map(([, code]) => code));
		const candidates = mergeAndRank(documentHits, codeHits, perCollectionLimit * 2).filter((item) => item.score >= this.options.minScore);

		return hybridRank(query, candidates)
			.slice(0, CONTEXT_LIMIT)
			.map((item) => ({ sourcePath: item.sourcePath, content: item.content, score: item.score, chunkId: item.id }));
	}
}

function dedupeHits(lists: QdrantSearchHit[][]): QdrantSearchHit[] {
	const best = new Map<string, QdrantSearchHit>();
	for (const hits of lists) {
		for (const hit of hits) {
			const seen = best.get(hit.id);
			if (!seen || hit.score > seen.score) best.set(hit.id, hit);
		}
	}
	return [...best.values()];
}
