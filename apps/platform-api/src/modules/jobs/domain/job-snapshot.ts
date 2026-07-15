import type { PipelineJob, PipelineJobType } from '@meshify/data-access';
import type { JobEvent } from '@meshify/queues';

/**
 * Maps a persisted pipeline_jobs row to the same wire shape the worker
 * publishes live (JobEvent), so a client that connects mid-job gets an initial
 * snapshot in the exact format its reducer already handles. The title is a
 * generic per-type label — the next live progress event refines it to the real
 * subject (filename, repo URL, workspace name).
 */
export function pipelineJobToEvent(job: PipelineJob): JobEvent {
	return {
		jobId: job.id,
		projectId: job.projectId,
		jobType: job.jobType,
		title: genericTitle(job.jobType),
		phase: statusToPhase(job),
		stage: job.stage ?? undefined,
		percent: job.progress ?? undefined,
		error: job.lastError ?? undefined,
		at: (job.completedAt ?? job.updatedAt).toISOString(),
	};
}

function statusToPhase(job: PipelineJob): JobEvent['phase'] {
	switch (job.status) {
		case 'completed':
			return 'completed';
		case 'failed':
		case 'dead_letter':
			return 'failed';
		case 'running':
			return job.progress != null ? 'progress' : 'running';
		default:
			return 'running'; // queued — shown as "starting" until the worker picks it up
	}
}

const TYPE_LABELS: Record<PipelineJobType, string> = {
	ingest_document: 'Document upload',
	clone_repo: 'Repository ingestion',
	sync_repo: 'Repository sync',
	slack_ingest: 'Slack ingestion',
	slack_sync: 'Slack sync',
	reindex: 'Reindex',
	cleanup: 'Cleanup',
};

function genericTitle(jobType: PipelineJobType): string {
	return TYPE_LABELS[jobType] ?? 'Background job';
}
