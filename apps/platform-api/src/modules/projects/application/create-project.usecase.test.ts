import { describe, expect, it } from 'vitest';
import type { Project, ProjectRepository } from '@meshify/data-access';
import type { QdrantCollectionProvisioner } from '@meshify/vector-store';
import { CreateProjectUseCase, OrgNotFoundError } from './create-project.usecase.js';

interface ProvisionerCall {
	op: 'ensure' | 'delete';
	name: string;
	dimension?: number;
}

function makeQdrantFake(failOnEnsure?: (name: string) => boolean) {
	const calls: ProvisionerCall[] = [];
	const fake = {
		async ensureCollection(name: string, dimension: number) {
			calls.push({ op: 'ensure', name, dimension });
			if (failOnEnsure?.(name)) throw new Error(`ensure failed for ${name}`);
		},
		async deleteCollection(name: string) {
			calls.push({ op: 'delete', name });
		},
	} as unknown as QdrantCollectionProvisioner;
	return { fake, calls };
}

function makeProjectRepo(opts: { orgExists?: boolean; failCreate?: boolean } = {}) {
	const repo = {
		async orgExists() {
			return opts.orgExists ?? true;
		},
		async create(input: never) {
			if (opts.failCreate) throw new Error('insert failed');
			return { ...(input as object), status: 'active', createdAt: new Date(), updatedAt: new Date(), deletedAt: null } as unknown as Project;
		},
		async findById() {
			return undefined;
		},
		async delete() {},
	} satisfies ProjectRepository;
	return repo;
}

const COMMAND = {
	orgId: '11111111-1111-4111-8111-111111111111',
	name: 'Test',
	llmProfile: 'openai-5',
	embeddingProfile: 'text-embedding-3-large',
};

describe('CreateProjectUseCase', () => {
	it('rejects unknown organizations before provisioning anything', async () => {
		const { fake, calls } = makeQdrantFake();
		const usecase = new CreateProjectUseCase(makeProjectRepo({ orgExists: false }), fake);
		await expect(usecase.execute(COMMAND)).rejects.toBeInstanceOf(OrgNotFoundError);
		expect(calls).toHaveLength(0);
	});

	it('provisions both collections with the embedding profile dimension (3072 for text-embedding-3-large)', async () => {
		const { fake, calls } = makeQdrantFake();
		const usecase = new CreateProjectUseCase(makeProjectRepo(), fake);
		const project = await usecase.execute(COMMAND);

		const ensures = calls.filter((c) => c.op === 'ensure');
		expect(ensures).toHaveLength(2);
		expect(ensures.every((c) => c.dimension === 3072)).toBe(true);
		expect(project.qdrantCollectionDocs).toMatch(/_documents$/);
		expect(project.qdrantCollectionCode).toMatch(/_code$/);
	});

	it('rolls back the docs collection when the code collection fails to provision', async () => {
		const { fake, calls } = makeQdrantFake((name) => name.endsWith('_code'));
		const usecase = new CreateProjectUseCase(makeProjectRepo(), fake);
		await expect(usecase.execute(COMMAND)).rejects.toThrow(/ensure failed/);

		const deletes = calls.filter((c) => c.op === 'delete');
		expect(deletes).toHaveLength(1);
		expect(deletes[0]!.name).toMatch(/_documents$/);
	});

	it('rolls back both collections when the database insert fails', async () => {
		const { fake, calls } = makeQdrantFake();
		const usecase = new CreateProjectUseCase(makeProjectRepo({ failCreate: true }), fake);
		await expect(usecase.execute(COMMAND)).rejects.toThrow(/insert failed/);

		const deletes = calls.filter((c) => c.op === 'delete');
		expect(deletes.map((c) => c.name).sort()).toEqual(
			calls
				.filter((c) => c.op === 'ensure')
				.map((c) => c.name)
				.sort()
		);
	});
});
