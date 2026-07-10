import { Queue, type ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTS } from './job-options.js';

export const REPO_INGEST_QUEUE = 'repo-ingest';
export const REPO_SYNC_QUEUE = 'repo-sync';

export interface RepoIngestJobPayload {
	pipelineJobId: string;
	repositoryId: string;
	projectId: string;
}

export type RepoSyncJobPayload = RepoIngestJobPayload;

export function createRepoIngestQueue(connection: ConnectionOptions): Queue<RepoIngestJobPayload> {
	return new Queue<RepoIngestJobPayload>(REPO_INGEST_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}

export function createRepoSyncQueue(connection: ConnectionOptions): Queue<RepoSyncJobPayload> {
	return new Queue<RepoSyncJobPayload>(REPO_SYNC_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}
