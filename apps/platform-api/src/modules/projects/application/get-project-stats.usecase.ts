import type { ChatRepository, DocumentRepository, RepositoryRepository } from '@meshify/data-access';

export interface ProjectStats {
	repositories: { total: number; synced: number };
	documents: { total: number; embedded: number };
	conversations: number;
	/** Fraction of documents fully embedded (0–1), or null when the project has no documents. */
	coverage: number | null;
	/** Most recent document/repository activity, ISO 8601, or null when the project is empty. */
	lastActivityAt: string | null;
}

/**
 * Aggregates a project's real counts for Project Home: connected repositories
 * (and how many are synced), ingested documents (and how many are embedded),
 * and active conversations. "Knowledge coverage" is a real, honest metric here
 * — the share of documents that have finished embedding — not an invented
 * number. Composed from existing repositories; no new tables.
 */
export class GetProjectStatsUseCase {
	constructor(
		private readonly documents: DocumentRepository,
		private readonly repositories: RepositoryRepository,
		private readonly chats: ChatRepository
	) {}

	async execute(projectId: string): Promise<ProjectStats> {
		const [documents, repositories, conversations] = await Promise.all([
			this.documents.statsByProject(projectId),
			this.repositories.statsByProject(projectId),
			this.chats.countByProject(projectId),
		]);

		const lastActivity = [documents.lastUpdatedAt, repositories.lastUpdatedAt].reduce<Date | null>(
			(latest, ts) => (ts && (!latest || ts > latest) ? ts : latest),
			null
		);

		return {
			repositories: { total: repositories.total, synced: repositories.synced },
			documents: { total: documents.total, embedded: documents.embedded },
			conversations,
			coverage: documents.total > 0 ? documents.embedded / documents.total : null,
			lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
		};
	}
}
