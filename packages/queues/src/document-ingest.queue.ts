import { Queue, type ConnectionOptions } from 'bullmq';

export const DOCUMENT_INGEST_QUEUE = 'document-ingest';

export interface DocumentIngestJobPayload {
	pipelineJobId: string;
	documentId: string;
	projectId: string;
}

const DEFAULT_JOB_OPTS = {
	attempts: 5,
	backoff: { type: 'exponential' as const, delay: 5000 },
	removeOnComplete: { age: 24 * 60 * 60 },
	removeOnFail: false as const, // kept for DLQ inspection — BullMQ's failed-job list is the DLQ
};

export function createDocumentIngestQueue(connection: ConnectionOptions): Queue<DocumentIngestJobPayload> {
	return new Queue<DocumentIngestJobPayload>(DOCUMENT_INGEST_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}
