import { describe, expect, it, vi } from 'vitest';
import type { QdrantCollectionProvisioner } from '@meshify/vector-store';
import { InMemoryDocumentRepository, InMemoryProjectRepository, InMemoryRepositoryRepository, buildDocument, buildProject, buildRepository } from '@meshify/testing';
import { DeleteProjectUseCase, ProjectNotFoundError } from './delete-project.usecase.js';

function harness(options: { storageFails?: string; terminateFails?: boolean } = {}) {
	const project = buildProject({ id: 'p1', qdrantCollectionDocs: 'p1_docs', qdrantCollectionCode: 'p1_code' });
	const projects = new InMemoryProjectRepository({ projects: [project] });
	const documents = new InMemoryDocumentRepository([
		buildDocument({ id: 'd1', projectId: 'p1', objectStorageKey: 'projects/p1/documents/d1/a.md' }),
		buildDocument({ id: 'd2', projectId: 'p1', objectStorageKey: 'projects/p1/documents/d2/b.md' }),
		buildDocument({ id: 'other', projectId: 'p2', objectStorageKey: 'projects/p2/documents/x/c.md' }),
	]);
	const repositories = new InMemoryRepositoryRepository([
		buildRepository({ id: 'r1', projectId: 'p1', archiveObjectKey: 'projects/p1/repositories/r1.zip' }),
		buildRepository({ id: 'r2', projectId: 'p1', archiveObjectKey: null }),
	]);
	const events: string[] = [];
	const qdrant = { deleteCollection: async (name: string) => void events.push(`qdrant:${name}`) } as unknown as QdrantCollectionProvisioner;
	const storage = {
		deleteObject: async (key: string) => {
			if (key === options.storageFails) throw new Error('s3 503');
			events.push(`s3:${key}`);
		},
	};
	const pipelines = {
		terminatePipeline: async (guid: string, kind: string) => {
			if (options.terminateFails) throw new Error('engine wedged');
			events.push(`stop:${kind}:${guid}`);
		},
	};
	const logger = { warn: vi.fn() };
	const usecase = new DeleteProjectUseCase(projects, qdrant, documents, repositories, storage, pipelines, logger);
	return { usecase, project, projects, events, logger };
}

describe('DeleteProjectUseCase', () => {
	it('cuts off search first, then stops pipelines and removes stored objects, then deletes the row', async () => {
		const h = harness();
		await h.usecase.execute('p1');

		expect(h.events.slice(0, 2)).toEqual(['qdrant:p1_docs', 'qdrant:p1_code']);
		expect(h.events.filter((e) => e.startsWith('stop:'))).toEqual([
			`stop:chat:${h.project.rocketrideChatPipelineId}`,
			`stop:ingest:${h.project.rocketrideDocsIngestPipelineId}`,
			`stop:ingest:${h.project.rocketrideCodeIngestPipelineId}`,
		]);
		// Only this project's objects, and only rows that actually have one.
		expect(h.events.filter((e) => e.startsWith('s3:')).sort()).toEqual(['s3:projects/p1/documents/d1/a.md', 's3:projects/p1/documents/d2/b.md', 's3:projects/p1/repositories/r1.zip']);
		expect(await h.projects.findById('p1')).toBeUndefined();
	});

	it('still deletes the project when a stored object or a pipeline cannot be removed, and reports it', async () => {
		const h = harness({ storageFails: 'projects/p1/documents/d1/a.md', terminateFails: true });
		await h.usecase.execute('p1');
		expect(await h.projects.findById('p1')).toBeUndefined();
		expect(h.logger.warn).toHaveBeenCalledTimes(4); // 3 pipelines + 1 object
	});

	it('rejects an unknown project before touching anything', async () => {
		const h = harness();
		await expect(h.usecase.execute('nope')).rejects.toBeInstanceOf(ProjectNotFoundError);
		expect(h.events).toEqual([]);
	});
});
