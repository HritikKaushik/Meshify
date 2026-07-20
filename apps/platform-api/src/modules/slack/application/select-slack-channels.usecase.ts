import { randomUUID } from 'node:crypto';
import type { KnowledgeConnectorRepository, PipelineJobRepository, SlackChannelRepository, SlackWorkspaceRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { SlackIngestJobPayload, SourceSyncJobPayload } from '@meshify/queues';
import { loadSlackWorkspace } from './slack-support.js';

/**
 * Persists the set of channels to ingest and queues a Slack ingestion job —
 * mirrors the create-row → pipeline_job → enqueue triad the repository connect
 * use case uses. The job id is pinned to the pipeline_jobs row for idempotency.
 */
export class SelectSlackChannelsUseCase {
	constructor(
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly workspaces: SlackWorkspaceRepository,
		private readonly channels: SlackChannelRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly ingestQueue: Queue<SlackIngestJobPayload>,
		private readonly sourceSyncQueue: Queue<SourceSyncJobPayload>
	) {}

	async execute(command: { projectId: string; connectorId: string; channelIds: string[] }): Promise<{ jobId: string; selectedCount: number }> {
		const { workspace } = await loadSlackWorkspace(this.connectors, this.workspaces, command.projectId, command.connectorId);

		await this.channels.setSelected(workspace.id, command.channelIds);

		// Integration-linked workspaces ride the provider platform's generic lane
		// (a selection change warrants a full pull of the newly-selected channels).
		if (workspace.integrationId) {
			const { job, created } = await this.pipelineJobs.createDeduped({
				id: randomUUID(),
				projectId: command.projectId,
				jobType: 'source_sync',
				payload: { connectorId: command.connectorId, mode: 'full' },
				dedupeKey: `source_sync:${command.connectorId}:full`,
			});
			if (created) {
				await this.sourceSyncQueue.add(
					'ingest',
					{ pipelineJobId: job.id, connectorId: command.connectorId, projectId: command.projectId, mode: 'full' },
					{ jobId: job.id }
				);
			}
			return { jobId: job.id, selectedCount: command.channelIds.length };
		}

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId: command.projectId,
			jobType: 'slack_ingest',
			payload: { connectorId: command.connectorId, workspaceId: workspace.id },
		});

		await this.ingestQueue.add(
			'ingest',
			{ pipelineJobId, connectorId: command.connectorId, workspaceId: workspace.id, projectId: command.projectId },
			{ jobId: pipelineJobId }
		);

		return { jobId: pipelineJobId, selectedCount: command.channelIds.length };
	}
}
