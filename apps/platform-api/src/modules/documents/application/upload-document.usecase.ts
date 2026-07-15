import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import {
	sourceTypeFromFilename,
	type Document,
	type DocumentRepository,
	type KnowledgeConnectorRepository,
	type PipelineJobRepository,
} from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { Queue } from 'bullmq';
import type { DocumentIngestJobPayload } from '@meshify/queues';

export interface UploadDocumentCommand {
	projectId: string;
	filename: string;
	mimeType: string;
	buffer: Buffer;
}

export interface UploadDocumentResult {
	document: Document;
	jobId: string;
	deduped: boolean;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — presigned direct-to-storage upload is the path for anything larger
const ALLOWED_MIME_TYPES = new Set([
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'text/plain',
	'text/markdown',
	'text/x-markdown',
]);

export class UploadDocumentUseCase {
	constructor(
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly documents: DocumentRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly storage: ObjectStorageClient,
		private readonly ingestQueue: Queue<DocumentIngestJobPayload>
	) {}

	/** The project's singleton `documents` connector owns every uploaded file; created lazily on first upload. */
	private async ensureDocumentsConnector(projectId: string): Promise<string> {
		const existing = await this.connectors.findByProjectAndType(projectId, 'documents');
		if (existing) return existing.id;
		const connector = await this.connectors.create({
			id: randomUUID(),
			projectId,
			type: 'documents',
			displayName: 'Uploaded documents',
			status: 'active',
		});
		return connector.id;
	}

	async execute(command: UploadDocumentCommand): Promise<UploadDocumentResult> {
		if (command.buffer.byteLength === 0) throw new Error('Uploaded file is empty');
		if (command.buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB inline upload limit`);
		if (!ALLOWED_MIME_TYPES.has(command.mimeType)) throw new Error(`Unsupported MIME type "${command.mimeType}"`);

		const sourceType = sourceTypeFromFilename(command.filename);
		const contentHash = createHash('sha256').update(command.buffer).digest('hex');

		const existing = await this.documents.findByProjectAndHash(command.projectId, contentHash);
		if (existing && existing.status === 'embedded') {
			// Identical content already indexed for this project — no-op, no new job.
			return { document: existing, jobId: '', deduped: true };
		}

		const connectorId = await this.ensureDocumentsConnector(command.projectId);

		const id = randomUUID();
		const objectStorageKey = `projects/${command.projectId}/documents/${id}/${command.filename}`;
		await this.storage.putObject(objectStorageKey, command.buffer, command.mimeType);

		const document = await this.documents.create({
			id,
			projectId: command.projectId,
			connectorId,
			sourceType,
			filename: command.filename,
			objectStorageKey,
			contentHash,
		});

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId: command.projectId,
			jobType: 'ingest_document',
			payload: { documentId: document.id },
		});

		await this.ingestQueue.add(
			'ingest',
			{ pipelineJobId, documentId: document.id, projectId: command.projectId },
			{ jobId: pipelineJobId }
		);

		return { document, jobId: pipelineJobId, deduped: false };
	}
}
