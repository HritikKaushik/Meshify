import { Queue, type ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTS } from './job-options.js';

export const SLACK_INGEST_QUEUE = 'slack-ingest';
export const SLACK_SYNC_QUEUE = 'slack-sync';

export interface SlackIngestJobPayload {
	pipelineJobId: string;
	connectorId: string;
	workspaceId: string;
	projectId: string;
}

/** Sync reuses the same shape — a workspace-scoped incremental pull over its selected channels. */
export type SlackSyncJobPayload = SlackIngestJobPayload;

export function createSlackIngestQueue(connection: ConnectionOptions): Queue<SlackIngestJobPayload> {
	return new Queue<SlackIngestJobPayload>(SLACK_INGEST_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}

export function createSlackSyncQueue(connection: ConnectionOptions): Queue<SlackSyncJobPayload> {
	return new Queue<SlackSyncJobPayload>(SLACK_SYNC_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}
