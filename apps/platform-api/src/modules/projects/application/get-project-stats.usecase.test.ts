import { describe, expect, it } from 'vitest';
import {
	InMemoryChatRepository,
	InMemoryDocumentRepository,
	InMemoryRepositoryRepository,
	buildChat,
	buildDocument,
	buildRepository,
} from '@meshify/testing';
import { GetProjectStatsUseCase } from './get-project-stats.usecase.js';

const PROJECT_ID = 'proj-1';

describe('GetProjectStatsUseCase', () => {
	it('reports null coverage for an empty project', async () => {
		const usecase = new GetProjectStatsUseCase(new InMemoryDocumentRepository(), new InMemoryRepositoryRepository(), new InMemoryChatRepository());
		expect(await usecase.execute(PROJECT_ID)).toMatchObject({
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
		const documents = new InMemoryDocumentRepository([
			buildDocument({ id: 'd1', status: 'embedded', updatedAt: older }),
			buildDocument({ id: 'd2', status: 'embedded', updatedAt: newer }),
			buildDocument({ id: 'd3', status: 'pending', updatedAt: older }),
		]);
		const repositories = new InMemoryRepositoryRepository([
			buildRepository({ id: 'r1', syncStatus: 'synced', updatedAt: older }),
			buildRepository({ id: 'r2', syncStatus: 'cloning', updatedAt: older }),
		]);
		const chats = new InMemoryChatRepository({ chats: ['c1', 'c2', 'c3', 'c4'].map((id) => buildChat({ id })) });

		const stats = await new GetProjectStatsUseCase(documents, repositories, chats).execute(PROJECT_ID);

		expect(stats.documents).toEqual({ total: 3, embedded: 2 });
		expect(stats.repositories).toEqual({ total: 2, synced: 1 });
		expect(stats.conversations).toBe(4);
		expect(stats.coverage).toBeCloseTo(2 / 3);
		expect(stats.lastActivityAt).toBe(newer.toISOString());
	});
});
