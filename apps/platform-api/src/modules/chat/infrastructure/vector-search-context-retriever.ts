import type { Project } from '@meshify/data-access';
import type { QdrantSearchClient } from '@meshify/vector-store';
import type { EmbeddingProviderFactory } from '../../search/application/search.usecase.js';
import { mergeAndRank } from '../../search/domain/search-result.js';
import type { ChatContextRetriever } from '../application/chat-context-retriever.port.js';
import type { RetrievedChunk } from '../domain/build-rag-prompt.js';

/** Top-N context chunks handed to the LLM per chat turn — small enough that the model reliably grounds on all of them (see chat-pipeline.ts for why RocketRide's own retrieval had no such cap). */
const CONTEXT_LIMIT = 8;
const PER_COLLECTION_MULTIPLIER = 2;

/**
 * Reuses the exact retrieval path `/search` already uses (same embedding
 * provider, same direct Qdrant REST client, same RocketRide payload mapping)
 * so chat and search never disagree about what a project's real content is.
 */
export class VectorSearchContextRetriever implements ChatContextRetriever {
	constructor(
		private readonly embeddings: EmbeddingProviderFactory,
		private readonly qdrant: QdrantSearchClient
	) {}

	async retrieve(project: Project, query: string): Promise<RetrievedChunk[]> {
		const provider = this.embeddings.forProject(project);
		const vector = await provider.embed(query);

		const perCollectionLimit = CONTEXT_LIMIT * PER_COLLECTION_MULTIPLIER;
		const [documentHits, codeHits] = await Promise.all([
			this.qdrant.search(project.qdrantCollectionDocs, vector, { limit: perCollectionLimit }),
			this.qdrant.search(project.qdrantCollectionCode, vector, { limit: perCollectionLimit }),
		]);

		return mergeAndRank(documentHits, codeHits, CONTEXT_LIMIT).map((item) => ({
			sourcePath: item.sourcePath,
			content: item.content,
			score: item.score,
			chunkId: item.id,
		}));
	}
}
