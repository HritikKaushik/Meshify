import { randomUUID } from 'node:crypto';
import type { PipelineJobRepository, RepositoryRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { RepoSyncJobPayload } from '@meshify/queues';

export class RepositoryNotFoundError extends Error {
	constructor(id: string) {
		super(`Repository "${id}" does not exist in this project`);
		this.name = 'RepositoryNotFoundError';
	}
}

export class SyncRepositoryUseCase {
	constructor(
		private readonly repositories: RepositoryRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly syncQueue: Queue<RepoSyncJobPayload>
	) {}

	async execute(projectId: string, repositoryId: string): Promise<{ jobId: string }> {
		const repository = await this.repositories.findById(repositoryId);
		// Cross-project probing must look identical to a missing repository.
		if (!repository || repository.projectId !== projectId) throw new RepositoryNotFoundError(repositoryId);
		if (repository.source !== 'github') throw new Error('Only GitHub repositories can be synced; upload a new ZIP instead');

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId,
			jobType: 'sync_repo',
			payload: { repositoryId },
		});

		await this.syncQueue.add('sync', { pipelineJobId, repositoryId, projectId }, { jobId: pipelineJobId });

		return { jobId: pipelineJobId };
	}
}
