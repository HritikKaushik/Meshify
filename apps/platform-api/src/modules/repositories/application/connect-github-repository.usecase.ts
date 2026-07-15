import { randomUUID } from 'node:crypto';
import { parseGitHubUrl } from '@meshify/data-access';
import type { KnowledgeConnectorRepository, PipelineJobRepository, Repository, RepositoryRepository } from '@meshify/data-access';
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
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly repositories: RepositoryRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly ingestQueue: Queue<RepoIngestJobPayload>
	) {}

	async execute(command: ConnectGitHubRepositoryCommand): Promise<ConnectRepositoryResult> {
		parseGitHubUrl(command.remoteUrl); // validate before any writes; throws with a clear message

		// A GitHub repository is modeled as a `github` KnowledgeConnector (1:1).
		const connector = await this.connectors.create({
			id: randomUUID(),
			projectId: command.projectId,
			type: 'github',
			displayName: command.remoteUrl,
			status: 'connecting',
			config: { source: 'github', remoteUrl: command.remoteUrl },
		});

		const repository = await this.repositories.create({
			id: randomUUID(),
			projectId: command.projectId,
			connectorId: connector.id,
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
