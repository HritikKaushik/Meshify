import type { PipelineJob, PipelineJobStatus, PipelineJobType } from './pipeline-job.entity.js';

export interface CreatePipelineJobInput {
	id: string;
	projectId: string;
	jobType: PipelineJobType;
	payload: Record<string, unknown>;
}

export interface PipelineJobRepository {
	create(input: CreatePipelineJobInput): Promise<PipelineJob>;
	findById(id: string): Promise<PipelineJob | undefined>;
	markRunning(id: string): Promise<void>;
	markCompleted(id: string): Promise<void>;
	markFailed(id: string, error: string, nextStatus: 'failed' | 'dead_letter'): Promise<void>;
	incrementAttempts(id: string): Promise<number>;
}
