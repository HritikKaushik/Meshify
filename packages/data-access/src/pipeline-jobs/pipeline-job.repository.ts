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
	/** Org-scoped lookup for tenant isolation on read paths (joins projects.org_id). */
	findByIdForOrg(id: string, orgId: string): Promise<PipelineJob | undefined>;
	/** In-flight jobs (queued/running) for a project — the initial snapshot for the Job Progress Center. */
	listActiveByProject(projectId: string): Promise<PipelineJob[]>;
	/** Most recent jobs for a project (any status), newest first — the History section. */
	listRecentByProject(projectId: string, limit: number): Promise<PipelineJob[]>;
	markRunning(id: string): Promise<void>;
	/** Record the current stage + completion percent (0-100) of a running job. */
	updateProgress(id: string, progress: { stage: string; percent: number }): Promise<void>;
	markCompleted(id: string): Promise<void>;
	markFailed(id: string, error: string, nextStatus: 'failed' | 'dead_letter'): Promise<void>;
	incrementAttempts(id: string): Promise<number>;
}
