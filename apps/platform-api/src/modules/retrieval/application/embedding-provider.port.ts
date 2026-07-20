import type { Project } from '@meshify/data-access';
import type { EmbeddingProvider } from '@meshify/embeddings';

/**
 * Builds the query-embedding provider for a project, or throws a typed error the
 * caller maps to a status. The retrieval seam shared by the chat RAG context
 * retriever and the configured embedding-provider factory.
 */
export interface EmbeddingProviderFactory {
	forProject(project: Project): EmbeddingProvider;
}
