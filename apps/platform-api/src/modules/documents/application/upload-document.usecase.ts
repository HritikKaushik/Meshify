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

/** The request itself is unacceptable (empty, too large, unsupported type) — a 400. */
export class DocumentValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DocumentValidationError';
	}
}

/**
 * A different document with this filename already exists in the project — a 409.
 * Filenames are the source path that keys a document's vectors, so two documents
 * sharing one would be indistinguishable at deletion time (uq_documents_project_filename).
 */
export class DocumentFilenameConflictError extends Error {
	constructor(readonly filename: string, readonly existingDocumentId: string) {
		super(`A document named "${filename}" already exists in this project — delete it first or rename the file`);
		this.name = 'DocumentFilenameConflictError';
	}
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
		if (command.buffer.byteLength === 0) throw new DocumentValidationError('Uploaded file is empty');
		if (command.buffer.byteLength > MAX_UPLOAD_BYTES) throw new DocumentValidationError(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB inline upload limit`);
		if (!ALLOWED_MIME_TYPES.has(command.mimeType)) throw new DocumentValidationError(`Unsupported MIME type "${command.mimeType}"`);

		let sourceType;
		try {
			sourceType = sourceTypeFromFilename(command.filename);
		} catch (err) {
			throw new DocumentValidationError(err instanceof Error ? err.message : 'Unsupported document type');
		}
		const contentHash = createHash('sha256').update(command.buffer).digest('hex');

		const existing = await this.documents.findByProjectAndHash(command.projectId, contentHash);
		if (existing && existing.status === 'embedded') {
			// Identical content already indexed for this project — no-op, no new job.
			return { document: existing, jobId: '', deduped: true };
		}

		// Different content under an existing name would collide on the vector
		// source path; refuse up front (the unique index is the backstop below).
		const sameName = await this.documents.findByProjectAndFilename(command.projectId, command.filename);
		if (sameName && sameName.contentHash !== contentHash) throw new DocumentFilenameConflictError(command.filename, sameName.id);

		const connectorId = await this.ensureDocumentsConnector(command.projectId);

		const id = randomUUID();
		const objectStorageKey = `projects/${command.projectId}/documents/${id}/${command.filename}`;
		await this.storage.putObject(objectStorageKey, command.buffer, command.mimeType);

		let document: Document;
		try {
			document = await this.documents.create({
				id,
				projectId: command.projectId,
				connectorId,
				sourceType,
				filename: command.filename,
				objectStorageKey,
				contentHash,
			});
		} catch (err) {
			// Lost a race with a concurrent upload of the same name: the object we
			// just stored belongs to no row, so remove it before reporting the clash.
			if (isUniqueViolation(err)) {
				await this.storage.deleteObject(objectStorageKey).catch(() => undefined);
				const winner = await this.documents.findByProjectAndFilename(command.projectId, command.filename);
				throw new DocumentFilenameConflictError(command.filename, winner?.id ?? 'unknown');
			}
			throw err;
		}

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

/** Postgres unique_violation (SQLSTATE 23505) on the per-project filename index. */
function isUniqueViolation(err: unknown): boolean {
	const e = err as { code?: string; constraint?: string };
	return e?.code === '23505' && (e.constraint === undefined || e.constraint === 'uq_documents_project_filename');
}
