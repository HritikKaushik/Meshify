import type { Job } from 'bullmq';
import type { SlackSyncJobPayload } from '@meshify/queues';
import { ingestWorkspace, type SlackIngestionDeps } from '../slack/ingest-workspace.js';
import { runPipelineJob } from './run-pipeline-job.js';

export type SlackSyncProcessorDeps = SlackIngestionDeps;

/**
 * Incremental Slack sync: pull only messages newer than each channel's stored
 * cursor (slack_sync_state.last_synced_ts), regroup, skip conversations whose
 * content is unchanged, and purge+re-ingest the ones that changed — no full
 * re-index. Mirrors repo-sync, reusing the shared ingestion path with
 * incremental: true.
 */
export async function processSlackSyncJob(job: Job<SlackSyncJobPayload>, deps: SlackSyncProcessorDeps): Promise<void> {
	const { pipelineJobId, connectorId, workspaceId, projectId } = job.data;
	await runPipelineJob(
		job,
		pipelineJobId,
		deps.pipelineJobs,
		() => ingestWorkspace(deps, { connectorId, workspaceId, projectId }, { incremental: true }),
		(message) => deps.connectors.updateStatus(connectorId, 'error', message)
	);
}
