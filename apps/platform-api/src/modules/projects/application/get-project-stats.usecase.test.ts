import { describe, expect, it } from 'vitest';
import type { ChatRepository, DocumentRepository, RepositoryRepository } from '@meshify/data-access';
import { GetProjectStatsUseCase } from './get-project-stats.usecase.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function makeFakes(opts: {
	documents?: Array<{ status: string; updatedAt: Date }>;
	repositories?: Array<{ syncStatus: string; updatedAt: Date }>;
	conversations?: number;
}) {
	const documents = {
		async listByProject() {
			return (opts.documents ?? []) as never;
		},
	} as unknown as DocumentRepository;
	const repositories = {
		async listByProject() {
			return (opts.repositories ?? []) as never;
		},
	} as unknown as RepositoryRepository;
	const chats = {
		async findByProjectId() {
			return Array.from({ length: opts.conversations ?? 0 }, () => ({})) as never;
		},
	} as unknown as ChatRepository;
	return new GetProjectStatsUseCase(documents, repositories, chats);
}

describe('GetProjectStatsUseCase', () => {
	it('reports null coverage for an empty project', async () => {
		const stats = await makeFakes({}).execute(PROJECT_ID);
		expect(stats).toMatchObject({
			repositories: { total: 0, synced: 0 },
			documents: { total: 0, embedded: 0 },
			conversations: 0,
			coverage: null,
			lastActivityAt: null,
		});
	});

	it('computes coverage as embedded/total and picks the latest activity timestamp', async () => {
		const older = new Date('2026-01-01T00:00:00Z');
		const newer = new Date('2026-06-01T00:00:00Z');
		const stats = await makeFakes({
			documents: [
				{ status: 'embedded', updatedAt: older },
				{ status: 'embedded', updatedAt: newer },
				{ status: 'pending', updatedAt: older },
			],
			repositories: [
				{ syncStatus: 'synced', updatedAt: older },
				{ syncStatus: 'cloning', updatedAt: older },
			],
			conversations: 4,
		}).execute(PROJECT_ID);

		expect(stats.documents).toEqual({ total: 3, embedded: 2 });
		expect(stats.repositories).toEqual({ total: 2, synced: 1 });
		expect(stats.conversations).toBe(4);
		expect(stats.coverage).toBeCloseTo(2 / 3);
		expect(stats.lastActivityAt).toBe(newer.toISOString());
	});
});
