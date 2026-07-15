import type { MessageCitation } from '@meshify/data-access';

/**
 * Enriches raw citations (source_path + score) with source-specific metadata at
 * read time — the metadata RocketRide cannot carry through ingestion. Slack
 * citations gain channel/thread/author/timestamp/permalink from Postgres.
 * A port so AskQuestionUseCase stays unit-testable; the default no-op enricher
 * leaves citations untouched.
 */
export interface CitationEnricher {
	enrich(projectId: string, citations: MessageCitation[]): Promise<MessageCitation[]>;
}

export const noopCitationEnricher: CitationEnricher = {
	enrich: async (_projectId, citations) => citations,
};
