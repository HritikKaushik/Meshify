import type { Project } from '@meshify/data-access';
import type { ChatHistoryTurn } from '@meshify/rocketride-gateway';
import type { RetrievedChunk } from '../domain/build-rag-prompt.js';

export interface RetrieveOptions {
	/** Prior turns of the conversation; a follow-up question retrieves with its predecessor's subject (see buildRetrievalQueries). */
	history?: readonly ChatHistoryTurn[];
}

/**
 * Retrieves the top-N context chunks for a chat question, ranked by score.
 * Application-layer port so AskQuestionUseCase can be unit-tested without a
 * live Qdrant/embedding provider; implemented in infrastructure by reusing the
 * shared embedding + Qdrant retrieval path.
 */
export interface ChatContextRetriever {
	retrieve(project: Project, query: string, options?: RetrieveOptions): Promise<RetrievedChunk[]>;
}
