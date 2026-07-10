import { Queue, type ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTS } from './job-options.js';

export const DOCUMENT_INGEST_QUEUE = 'document-ingest';

export interface DocumentIngestJobPayload {
	pipelineJobId: string;
	documentId: string;
	projectId: string;
}

export function createDocumentIngestQueue(connection: ConnectionOptions): Queue<DocumentIngestJobPayload> {
	return new Queue<DocumentIngestJobPayload>(DOCUMENT_INGEST_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}
