import { randomUUID } from 'node:crypto';
import type { KnowledgeConnectorRepository, PipelineJobRepository, RepositoryRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { RepoSyncJobPayload, SourceSyncJobPayload } from '@meshify/queues';

export class RepositoryNotFoundError extends Error {
	constructor(id: string) {
		super(`Repository "${id}" does not exist in this project`);
		this.name = 'RepositoryNotFoundError';
	}
}

/**
 * Manual repository sync. Integration-linked repositories ride the provider
 * platform's generic source-sync lane (vault tokens, ConnectorEngine, dedupe);
 * legacy URL-pasted repositories keep the original repo-sync path until they
 * are upgraded to a managed connection.
 */
export class SyncRepositoryUseCase {
	constructor(
		private readonly repositories: RepositoryRepository,
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly legacySyncQueue: Queue<RepoSyncJobPayload>,
		private readonly sourceSyncQueue: Queue<SourceSyncJobPayload>
	) {}

	async execute(projectId: string, repositoryId: string): Promise<{ jobId: string }> {
		const repository = await this.repositories.findById(repositoryId);
		// Cross-project probing must look identical to a missing repository.
		if (!repository || repository.projectId !== projectId) throw new RepositoryNotFoundError(repositoryId);
		if (repository.source !== 'github') throw new Error('Only GitHub repositories can be synced; upload a new ZIP instead');

		const connector = repository.connectorId ? await this.connectors.findById(repository.connectorId) : undefined;

		if (connector?.integrationId) {
			const { job, created } = await this.pipelineJobs.createDeduped({
				id: randomUUID(),
				projectId,
				jobType: 'source_sync',
				payload: { connectorId: connector.id, mode: 'incremental' },
				dedupeKey: `source_sync:${connector.id}:incremental`,
			});
			if (created) {
				await this.sourceSyncQueue.add(
					'sync',
					{ pipelineJobId: job.id, connectorId: connector.id, projectId, mode: 'incremental' },
					{ jobId: job.id }
				);
			}
			return { jobId: job.id };
		}

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId,
			jobType: 'sync_repo',
			payload: { repositoryId },
		});
		await this.legacySyncQueue.add('sync', { pipelineJobId, repositoryId, projectId }, { jobId: pipelineJobId });
		return { jobId: pipelineJobId };
	}
}
