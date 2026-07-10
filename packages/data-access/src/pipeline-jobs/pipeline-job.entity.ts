export type PipelineJobType = 'ingest_document' | 'clone_repo' | 'sync_repo' | 'reindex' | 'cleanup';
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
