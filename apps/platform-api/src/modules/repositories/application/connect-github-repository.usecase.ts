import { randomUUID } from 'node:crypto';
import { parseGitHubUrl } from '@meshify/data-access';
import type { PipelineJobRepository, Repository, RepositoryRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { RepoIngestJobPayload } from '@meshify/queues';

export interface ConnectGitHubRepositoryCommand {
	projectId: string;
	remoteUrl: string;
}

export interface ConnectRepositoryResult {
	repository: Repository;
	jobId: string;
}

export class ConnectGitHubRepositoryUseCase {
	constructor(
		private readonly repositories: RepositoryRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly ingestQueue: Queue<RepoIngestJobPayload>
	) {}

	async execute(command: ConnectGitHubRepositoryCommand): Promise<ConnectRepositoryResult> {
		parseGitHubUrl(command.remoteUrl); // validate before any writes; throws with a clear message

		const repository = await this.repositories.create({
			id: randomUUID(),
			projectId: command.projectId,
			source: 'github',
			remoteUrl: command.remoteUrl,
		});

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId: command.projectId,
			jobType: 'clone_repo',
			payload: { repositoryId: repository.id },
		});

		await this.ingestQueue.add('ingest', { pipelineJobId, repositoryId: repository.id, projectId: command.projectId }, { jobId: pipelineJobId });

		return { repository, jobId: pipelineJobId };
	}
}
