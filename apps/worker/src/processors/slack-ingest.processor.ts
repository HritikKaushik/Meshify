import type { Job } from 'bullmq';
import type { SlackIngestJobPayload } from '@meshify/queues';
import { ingestWorkspace, type SlackIngestionDeps } from '../slack/ingest-workspace.js';
import { runPipelineJob } from './run-pipeline-job.js';
import { JobProgress } from './job-progress.js';

export type SlackIngestProcessorDeps = SlackIngestionDeps;

/**
 * Initial Slack ingestion for a workspace's selected channels: pull full
 * history, group into conversation documents, and stream them through the
 * project's docs-ingest pipeline into `_documents`. Mirrors the repo/document
 * ingest processors, reusing the shared pipeline-job lifecycle wrapper and
 * emitting real-time stage progress.
 */
export async function processSlackIngestJob(job: Job<SlackIngestJobPayload>, deps: SlackIngestProcessorDeps): Promise<void> {
	const { pipelineJobId, connectorId, workspaceId, projectId } = job.data;
	const progress = new JobProgress(deps.pipelineJobs, deps.jobEvents, { jobId: pipelineJobId, projectId, jobType: 'slack_ingest', title: 'Slack workspace' });
	await runPipelineJob(
		job,
		pipelineJobId,
		deps.pipelineJobs,
		() => ingestWorkspace(deps, { connectorId, workspaceId, projectId }, { incremental: false }, progress),
		(message) => deps.connectors.updateStatus(connectorId, 'error', message),
		progress
	);
}
