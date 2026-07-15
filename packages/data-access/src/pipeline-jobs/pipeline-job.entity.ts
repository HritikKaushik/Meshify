export type PipelineJobType = 'ingest_document' | 'clone_repo' | 'sync_repo' | 'reindex' | 'cleanup' | 'slack_ingest' | 'slack_sync';
export type PipelineJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead_letter';

export interface PipelineJob {
	id: string;
	projectId: string;
	jobType: PipelineJobType;
	status: PipelineJobStatus;
	rocketrideToken: string | null;
	attempts: number;
	lastError: string | null;
	payload: Record<string, unknown>;
	/** Current completion percent (0-100) while running, or null when not reported. */
	progress: number | null;
	/** Human-readable current stage (e.g. "Scanning repository"), or null. */
	stage: string | null;
	createdAt: Date;
	updatedAt: Date;
	completedAt: Date | null;
}

/** The statuses that represent an in-flight job (shown as active in the Job Progress Center). */
export const ACTIVE_JOB_STATUSES: readonly PipelineJobStatus[] = ['queued', 'running'];
