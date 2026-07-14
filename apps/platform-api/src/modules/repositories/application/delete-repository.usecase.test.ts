import { describe, expect, it, vi } from 'vitest';
import type { RepoFile, Repository } from '@meshify/data-access';
import { InMemoryFileRepository, InMemoryRepositoryRepository, buildRepoFile, buildRepository } from '@meshify/testing';
import { DeleteRepositoryUseCase } from './delete-repository.usecase.js';
import { RepositoryNotFoundError } from './sync-repository.usecase.js';

const PROJECT = { id: 'proj-1', qdrantCollectionCode: 'proj_code' };

function makeDeps(repo?: Repository, files: RepoFile[] = []) {
	const repositories = new InMemoryRepositoryRepository(repo ? [repo] : []);
	const fileRepo = new InMemoryFileRepository(files);
	const storage = { deleteObject: vi.fn(async () => {}) };
	const vectors = { deleteBySourcePaths: vi.fn(async () => {}) };
	return { repositories, fileRepo, storage, vectors };
}

describe('DeleteRepositoryUseCase', () => {
	it('404s when the repository does not exist', async () => {
		const { repositories, fileRepo, storage, vectors } = makeDeps();
		await expect(new DeleteRepositoryUseCase(repositories, fileRepo, storage, vectors).execute({ project: PROJECT, repositoryId: 'missing' })).rejects.toBeInstanceOf(RepositoryNotFoundError);
	});

	it('rejects a repository owned by another project (isolation)', async () => {
		const { repositories, fileRepo, storage, vectors } = makeDeps(buildRepository({ id: 'repo-1', projectId: 'someone-else' }));
		await expect(new DeleteRepositoryUseCase(repositories, fileRepo, storage, vectors).execute({ project: PROJECT, repositoryId: 'repo-1' })).rejects.toBeInstanceOf(RepositoryNotFoundError);
		expect(vectors.deleteBySourcePaths).not.toHaveBeenCalled();
		expect(await repositories.findById('repo-1')).toBeDefined();
	});

	it('purges code vectors by file path and deletes the row (github: no archive)', async () => {
		const files = [buildRepoFile({ id: 'f1', path: 'src/a.ts' }), buildRepoFile({ id: 'f2', path: 'src/b.ts' })];
		const { repositories, fileRepo, storage, vectors } = makeDeps(buildRepository({ id: 'repo-1', source: 'github', archiveObjectKey: null }), files);
		await new DeleteRepositoryUseCase(repositories, fileRepo, storage, vectors).execute({ project: PROJECT, repositoryId: 'repo-1' });
		expect(vectors.deleteBySourcePaths).toHaveBeenCalledWith('proj_code', ['src/a.ts', 'src/b.ts']);
		expect(storage.deleteObject).not.toHaveBeenCalled();
		expect(await repositories.findById('repo-1')).toBeUndefined();
	});

	it('deletes the uploaded archive for ZIP repositories', async () => {
		const { repositories, fileRepo, storage, vectors } = makeDeps(
			buildRepository({ id: 'repo-1', source: 'zip', archiveObjectKey: 'projects/p/repos/repo-1.zip' }),
			[buildRepoFile({ id: 'f1', path: 'x.ts' })]
		);
		await new DeleteRepositoryUseCase(repositories, fileRepo, storage, vectors).execute({ project: PROJECT, repositoryId: 'repo-1' });
		expect(storage.deleteObject).toHaveBeenCalledWith('projects/p/repos/repo-1.zip');
		expect(await repositories.findById('repo-1')).toBeUndefined();
	});

	it('still deletes the row when vector/archive cleanup fails (best-effort)', async () => {
		const { repositories, fileRepo } = makeDeps(buildRepository({ id: 'repo-1', source: 'zip', archiveObjectKey: 'a.zip' }), [buildRepoFile({ id: 'f1', path: 'x.ts' })]);
		const storage = { deleteObject: vi.fn(async () => { throw new Error('s3 down'); }) };
		const vectors = { deleteBySourcePaths: vi.fn(async () => { throw new Error('qdrant down'); }) };
		const errors: string[] = [];
		await new DeleteRepositoryUseCase(repositories, fileRepo, storage, vectors, (_c, m) => errors.push(m)).execute({ project: PROJECT, repositoryId: 'repo-1' });
		expect(await repositories.findById('repo-1')).toBeUndefined();
		expect(errors).toHaveLength(2);
	});
});
