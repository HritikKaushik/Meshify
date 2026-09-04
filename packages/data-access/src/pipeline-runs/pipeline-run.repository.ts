import type { PipelineRunSnapshot, PipelineRunTraceInput } from './pipeline-run.entity.js';

export interface PipelineRunRepository {
	/** Idempotent upsert keyed by runKey; returns the run's id. */
	upsertFromSnapshot(snapshot: PipelineRunSnapshot): Promise<string>;
	/** Marks the most recent not-yet-ended run for a project/source as ended. Returns the run id, if any. */
	markEnded(projectId: string, source: string, endedAt: Date): Promise<string | undefined>;
	/** Resolves the most recent run id for a project/source, creating a minimal placeholder if none exists yet. */
	ensureRunForTrace(projectId: string, source: string): Promise<string>;
	appendTrace(input: PipelineRunTraceInput): Promise<void>;
	/**
	 * Retention sweep: removes runs that ended before `before` (their traces
	 * cascade), plus runs that never recorded an end but started before it -
	 * a placeholder from a lost DAP stream would otherwise live forever.
	 * Returns the number of runs removed.
	 */
	deleteEndedBefore(before: Date): Promise<number>;
}
