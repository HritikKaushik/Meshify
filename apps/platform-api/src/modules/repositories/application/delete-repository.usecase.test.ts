import { describe, expect, it } from 'vitest';
import type { FileRepository, RepoFile, Repository, RepositoryRepository } from '@meshify/data-access';
import { DeleteRepositoryUseCase } from './delete-repository.usecase.js';
import { RepositoryNotFoundError } from './sync-repository.usecase.js';

const PROJECT = { id: '11111111-1111-4111-8111-111111111111', qdrantCollectionCode: 'proj_code' };

function makeFakes(repo?: Partial<Repository>, files: Array<Partial<RepoFile>> = []) {
	const deleted: string[] = [];
	const repositories = {
		async findById() {
			return repo as Repository | undefined;
		},
		async delete(id: string) {
			deleted.push(id);
		},
	} as unknown as RepositoryRepository;

	const fileRepo = {
		async listByRepository() {
			return files as RepoFile[];
		},
	} as unknown as FileRepository;

	const objectDeletes: string[] = [];
	const storage = { async deleteObject(key: string) { objectDeletes.push(key); } };

	const vectorDeletes: Array<{ collection: string; paths: string[] }> = [];
	const vectors = { async deleteBySourcePaths(collection: string, paths: string[]) { vectorDeletes.push({ collection, paths }); } };

	return { repositories, fileRepo, storage, vectors, deleted, objectDeletes, vectorDeletes };
}

const REPO: Partial<Repository> = { id: 'repo-1', projectId: PROJECT.id, source: 'github', remoteUrl: 'https://github.com/o/r', archiveObjectKey: null };

describe('DeleteRepositoryUseCase', () => {
	it('404s when the repository does not exist', async () => {
		const f = makeFakes(undefined);
		const usecase = new DeleteRepositoryUseCase(f.repositories, f.fileRepo, f.storage, f.vectors);
		await expect(usecase.execute({ project: PROJECT, repositoryId: 'missing' })).rejects.toBeInstanceOf(RepositoryNotFoundError);
		expect(f.deleted).toHaveLength(0);
	});

	it('rejects a repository owned by another project (isolation)', async () => {
		const f = makeFakes({ ...REPO, projectId: 'someone-else' });
		const usecase = new DeleteRepositoryUseCase(f.repositories, f.fileRepo, f.storage, f.vectors);
		await expect(usecase.execute({ project: PROJECT, repositoryId: 'repo-1' })).rejects.toBeInstanceOf(RepositoryNotFoundError);
		expect(f.deleted).toHaveLength(0);
		expect(f.vectorDeletes).toHaveLength(0);
	});

	it('purges code vectors by file path and deletes the row (github: no archive)', async () => {
		const f = makeFakes(REPO, [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]);
		const usecase = new DeleteRepositoryUseCase(f.repositories, f.fileRepo, f.storage, f.vectors);
		await usecase.execute({ project: PROJECT, repositoryId: 'repo-1' });
		expect(f.vectorDeletes).toEqual([{ collection: 'proj_code', paths: ['src/a.ts', 'src/b.ts'] }]);
		expect(f.objectDeletes).toHaveLength(0);
		expect(f.deleted).toEqual(['repo-1']);
	});

	it('deletes the uploaded archive for ZIP repositories', async () => {
		const f = makeFakes({ ...REPO, source: 'zip', archiveObjectKey: 'projects/p/repos/repo-1.zip' }, [{ path: 'x.ts' }]);
		const usecase = new DeleteRepositoryUseCase(f.repositories, f.fileRepo, f.storage, f.vectors);
		await usecase.execute({ project: PROJECT, repositoryId: 'repo-1' });
		expect(f.objectDeletes).toEqual(['projects/p/repos/repo-1.zip']);
		expect(f.deleted).toEqual(['repo-1']);
	});

	it('still deletes the row when vector/archive cleanup fails (best-effort)', async () => {
		const f = makeFakes({ ...REPO, source: 'zip', archiveObjectKey: 'a.zip' }, [{ path: 'x.ts' }]);
		f.vectors.deleteBySourcePaths = async () => { throw new Error('qdrant down'); };
		f.storage.deleteObject = async () => { throw new Error('s3 down'); };
		const errors: string[] = [];
		const usecase = new DeleteRepositoryUseCase(f.repositories, f.fileRepo, f.storage, f.vectors, (_c, m) => errors.push(m));
		await usecase.execute({ project: PROJECT, repositoryId: 'repo-1' });
		expect(f.deleted).toEqual(['repo-1']);
		expect(errors).toHaveLength(2);
	});
});
