import type { Project } from '@meshify/data-access';
import type { RetrievedChunk } from '../domain/build-rag-prompt.js';

/**
 * Retrieves the top-N context chunks for a chat question, ranked by score.
 * Application-layer port so AskQuestionUseCase can be unit-tested without a
 * live Qdrant/embedding provider; implemented in infrastructure by reusing the
 * same embedding + Qdrant search path as SearchUseCase.
 */
export interface ChatContextRetriever {
	retrieve(project: Project, query: string): Promise<RetrievedChunk[]>;
}
