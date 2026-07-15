import type { Job } from 'bullmq';
import type { SlackIngestJobPayload } from '@meshify/queues';
import { ingestWorkspace, type SlackIngestionDeps } from '../slack/ingest-workspace.js';
import { runPipelineJob } from './run-pipeline-job.js';

export type SlackIngestProcessorDeps = SlackIngestionDeps;

/**
 * Initial Slack ingestion for a workspace's selected channels: pull full
 * history, group into conversation documents, and stream them through the
 * project's docs-ingest pipeline into `_documents`. Mirrors the repo/document
 * ingest processors, reusing the shared pipeline-job lifecycle wrapper.
 */
export async function processSlackIngestJob(job: Job<SlackIngestJobPayload>, deps: SlackIngestProcessorDeps): Promise<void> {
	const { pipelineJobId, connectorId, workspaceId, projectId } = job.data;
	await runPipelineJob(
		job,
		pipelineJobId,
		deps.pipelineJobs,
		() => ingestWorkspace(deps, { connectorId, workspaceId, projectId }, { incremental: false }),
		(message) => deps.connectors.updateStatus(connectorId, 'error', message)
	);
}
