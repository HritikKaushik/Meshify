import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTS } from './job-options.js';

/**
 * The provider-platform's generic sync queue: one queue for every provider's
 * full/incremental syncs (the worker resolves the provider from the registry).
 * Supersedes the per-provider repo-sync/slack-* queues, which remain only to
 * drain in-flight legacy jobs.
 */
export const SOURCE_SYNC_QUEUE = 'source-sync';

export interface SourceSyncJobPayload {
	pipelineJobId: string;
	connectorId: string;
	projectId: string;
	mode: 'full' | 'incremental';
}

export function createSourceSyncQueue(connection: ConnectionOptions): Queue<SourceSyncJobPayload> {
	return new Queue<SourceSyncJobPayload>(SOURCE_SYNC_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}
