import { randomUUID } from 'node:crypto';
import type { KnowledgeConnectorRepository, PipelineJobRepository, SlackWorkspaceRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { SlackSyncJobPayload } from '@meshify/queues';
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
		private readonly syncQueue: Queue<SlackSyncJobPayload>
	) {}

	async execute(command: { projectId: string; connectorId: string }): Promise<{ jobId: string }> {
		const { workspace } = await loadSlackWorkspace(this.connectors, this.workspaces, command.projectId, command.connectorId);

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
