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
	createdAt: Date;
	updatedAt: Date;
	completedAt: Date | null;
}
