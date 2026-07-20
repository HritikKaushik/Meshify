/**
 * `source_sync` is the generic provider-platform sync job (mode in the
 * payload); the provider-specific types remain for legacy producers and
 * rendered history. The DB no longer CHECKs this enumeration.
 */
export type PipelineJobType = 'ingest_document' | 'clone_repo' | 'sync_repo' | 'slack_ingest' | 'slack_sync' | 'source_sync';
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
	/** Deterministic dedup key (e.g. `source_sync:<connectorId>`): at most one QUEUED job per key. Null for non-deduped jobs. */
	dedupeKey: string | null;
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
