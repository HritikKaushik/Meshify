import type { PipelineJob, PipelineJobType } from './pipeline-job.entity.js';

export interface CreatePipelineJobInput {
	id: string;
	projectId: string;
	jobType: PipelineJobType;
	payload: Record<string, unknown>;
	dedupeKey?: string;
}

export interface PipelineJobRepository {
	create(input: CreatePipelineJobInput): Promise<PipelineJob>;
	/**
	 * Create unless a QUEUED job with the same dedupeKey already exists (a
	 * running job does not block — events arriving mid-run queue exactly one
	 * follow-up). Returns the surviving job either way.
	 */
	createDeduped(input: CreatePipelineJobInput & { dedupeKey: string }): Promise<{ job: PipelineJob; created: boolean }>;
	findById(id: string): Promise<PipelineJob | undefined>;
	/** Org-scoped lookup for tenant isolation on read paths (joins projects.org_id). */
	findByIdForOrg(id: string, orgId: string): Promise<PipelineJob | undefined>;
	/** In-flight jobs (queued/running) for a project — the initial snapshot for the Job Progress Center. */
	listActiveByProject(projectId: string): Promise<PipelineJob[]>;
	/** Most recent jobs for a project (any status), newest first — the History section. */
	listRecentByProject(projectId: string, limit: number): Promise<PipelineJob[]>;
	/** Queued jobs older than `before` — the orphan-recovery sweep (row committed but enqueue may have failed). */
	listStuckQueued(before: Date): Promise<PipelineJob[]>;
	markRunning(id: string): Promise<void>;
	/** Record the current stage + completion percent (0-100) of a running job. */
	updateProgress(id: string, progress: { stage: string; percent: number }): Promise<void>;
	markCompleted(id: string): Promise<void>;
	markFailed(id: string, error: string, nextStatus: 'failed' | 'dead_letter'): Promise<void>;
	incrementAttempts(id: string): Promise<number>;
}
