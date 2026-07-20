import type { Project } from '@meshify/data-access';
import type { EmbeddingProvider } from '@meshify/embeddings';

/**
 * Builds the query-embedding provider for a project, or throws a typed error the
 * caller maps to a status. Shared by the chat RAG retriever and the embedding
 * provider factory. (The standalone semantic-search endpoint was removed; this
 * interface is retained because chat retrieval depends on it.)
 */
export interface EmbeddingProviderFactory {
	forProject(project: Project): EmbeddingProvider;
}
