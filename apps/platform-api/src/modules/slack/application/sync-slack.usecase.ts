import { randomUUID } from 'node:crypto';
import type { KnowledgeConnectorRepository, PipelineJobRepository, SlackWorkspaceRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { SlackSyncJobPayload, SourceSyncJobPayload } from '@meshify/queues';
import { loadSlackWorkspace } from './slack-support.js';

/**
 * Queues an incremental Slack sync for a workspace — mirrors SyncRepositoryUseCase.
 * The sync worker uses each channel's stored cursor so only new/changed
 * conversations are reprocessed (no full re-index).
 */
export class SyncSlackUseCase {
	constructor(
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly workspaces: SlackWorkspaceRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly syncQueue: Queue<SlackSyncJobPayload>,
		private readonly sourceSyncQueue: Queue<SourceSyncJobPayload>
	) {}

	async execute(command: { projectId: string; connectorId: string }): Promise<{ jobId: string }> {
		const { workspace } = await loadSlackWorkspace(this.connectors, this.workspaces, command.projectId, command.connectorId);

		// Integration-linked workspaces ride the provider platform's generic lane.
		if (workspace.integrationId) {
			const { job, created } = await this.pipelineJobs.createDeduped({
				id: randomUUID(),
				projectId: command.projectId,
				jobType: 'source_sync',
				payload: { connectorId: command.connectorId, mode: 'incremental' },
				dedupeKey: `source_sync:${command.connectorId}:incremental`,
			});
			if (created) {
				await this.sourceSyncQueue.add(
					'sync',
					{ pipelineJobId: job.id, connectorId: command.connectorId, projectId: command.projectId, mode: 'incremental' },
					{ jobId: job.id }
				);
			}
			return { jobId: job.id };
		}

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId: command.projectId,
			jobType: 'slack_sync',
			payload: { connectorId: command.connectorId, workspaceId: workspace.id },
		});

		await this.syncQueue.add(
			'sync',
			{ pipelineJobId, connectorId: command.connectorId, workspaceId: workspace.id, projectId: command.projectId },
			{ jobId: pipelineJobId }
		);

		return { jobId: pipelineJobId };
	}
}
