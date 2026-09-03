import { describe, expect, it } from 'vitest';
import type { Document, DocumentRepository, PipelineJobRepository } from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { Queue } from 'bullmq';
import type { DocumentIngestJobPayload } from '@meshify/queues';
import { InMemoryKnowledgeConnectorRepository } from '@meshify/testing';
import { DocumentFilenameConflictError, DocumentValidationError, UploadDocumentUseCase } from './upload-document.usecase.js';

function makeFakes(existing?: Partial<Document>, opts: { sameName?: Partial<Document>; createThrows?: unknown } = {}) {
	const created: unknown[] = [];
	const documents = {
		async create(input: never) {
			if (opts.createThrows) throw opts.createThrows;
			created.push(input);
			return { ...(input as object), status: 'pending', createdAt: new Date(), updatedAt: new Date() } as unknown as Document;
		},
		async findById() {
			return undefined;
		},
		async findByProjectAndHash() {
			return existing as Document | undefined;
		},
		async findByProjectAndFilename() {
			return opts.sameName as Document | undefined;
		},
		async updateStatus() {},
		async listByProject() {
			return [];
		},
		async delete() {},
		async statsByProject() {
			return { total: 0, embedded: 0, lastUpdatedAt: null };
		},
	} satisfies DocumentRepository;

	const jobsCreated: unknown[] = [];
	const pipelineJobs = {
		async create(input: never) {
			jobsCreated.push(input);
			return input as never;
		},
		async findById() {
			return undefined;
		},
		async markRunning() {},
		async markCompleted() {},
		async markFailed() {},
		async incrementAttempts() {
			return 0;
		},
	} satisfies PipelineJobRepository;

	const putCalls: Array<{ key: string }> = [];
	const deleted: string[] = [];
	const storage = {
		async putObject(key: string) {
			putCalls.push({ key });
		},
		async deleteObject(key: string) {
			deleted.push(key);
		},
	} as unknown as ObjectStorageClient;

	const enqueued: Array<{ name: string; payload: DocumentIngestJobPayload; opts?: { jobId?: string } }> = [];
	const queue = {
		async add(name: string, payload: DocumentIngestJobPayload, opts?: { jobId?: string }) {
			enqueued.push({ name, payload, opts });
		},
	} as unknown as Queue<DocumentIngestJobPayload>;

	const connectors = new InMemoryKnowledgeConnectorRepository();

	return { connectors, documents, pipelineJobs, storage, queue, created, jobsCreated, putCalls, deleted, enqueued };
}

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('UploadDocumentUseCase', () => {
	it('rejects empty files', async () => {
		const f = makeFakes();
		const usecase = new UploadDocumentUseCase(f.connectors, f.documents, f.pipelineJobs, f.storage, f.queue);
		await expect(usecase.execute({ projectId: PROJECT_ID, filename: 'a.md', mimeType: 'text/markdown', buffer: Buffer.alloc(0) })).rejects.toThrow(/empty/);
	});

	it('rejects unsupported MIME types before touching storage', async () => {
		const f = makeFakes();
		const usecase = new UploadDocumentUseCase(f.connectors, f.documents, f.pipelineJobs, f.storage, f.queue);
		await expect(usecase.execute({ projectId: PROJECT_ID, filename: 'a.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('x') })).rejects.toThrow(/Unsupported MIME/);
		expect(f.putCalls).toHaveLength(0);
		expect(f.enqueued).toHaveLength(0);
	});

	it('dedupes on content hash: already-embedded identical content produces no new document, upload, or job', async () => {
		const f = makeFakes({ id: 'existing-doc', status: 'embedded' });
		const usecase = new UploadDocumentUseCase(f.connectors, f.documents, f.pipelineJobs, f.storage, f.queue);

		const result = await usecase.execute({ projectId: PROJECT_ID, filename: 'same.md', mimeType: 'text/markdown', buffer: Buffer.from('identical content') });

		expect(result.deduped).toBe(true);
		expect(result.document.id).toBe('existing-doc');
		expect(f.created).toHaveLength(0);
		expect(f.putCalls).toHaveLength(0);
		expect(f.enqueued).toHaveLength(0);
	});

	it('happy path: stores the file under the project-scoped key, records document + job, enqueues with jobId', async () => {
		const f = makeFakes();
		const usecase = new UploadDocumentUseCase(f.connectors, f.documents, f.pipelineJobs, f.storage, f.queue);

		const result = await usecase.execute({ projectId: PROJECT_ID, filename: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('hello') });

		expect(result.deduped).toBe(false);
		expect(f.putCalls).toHaveLength(1);
		expect(f.putCalls[0]!.key).toMatch(new RegExp(`^projects/${PROJECT_ID}/documents/.+/notes\\.md$`));
		expect(f.created).toHaveLength(1);
		expect(f.jobsCreated).toHaveLength(1);
		expect(f.enqueued).toHaveLength(1);
		const job = f.enqueued[0]!;
		expect(job.payload.projectId).toBe(PROJECT_ID);
		expect(job.payload.pipelineJobId).toBe(result.jobId);
		// BullMQ jobId pinned to the pipeline_jobs row id makes the enqueue idempotent per job record.
		expect(job.opts?.jobId).toBe(result.jobId);
	});

	it('surfaces validation failures as DocumentValidationError (mapped to 400)', async () => {
		const f = makeFakes();
		const usecase = new UploadDocumentUseCase(f.connectors, f.documents, f.pipelineJobs, f.storage, f.queue);
		await expect(usecase.execute({ projectId: PROJECT_ID, filename: 'a.md', mimeType: 'text/markdown', buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(DocumentValidationError);
		await expect(usecase.execute({ projectId: PROJECT_ID, filename: 'a.xyz', mimeType: 'text/plain', buffer: Buffer.from('x') })).rejects.toBeInstanceOf(DocumentValidationError);
	});

	it('refuses a different file under an existing filename before touching storage (vectors are keyed by filename)', async () => {
		const f = makeFakes(undefined, { sameName: { id: 'doc-old', contentHash: 'other-hash' } });
		const usecase = new UploadDocumentUseCase(f.connectors, f.documents, f.pipelineJobs, f.storage, f.queue);
		const err = await usecase.execute({ projectId: PROJECT_ID, filename: 'spec.md', mimeType: 'text/markdown', buffer: Buffer.from('v2') }).catch((e) => e);
		expect(err).toBeInstanceOf(DocumentFilenameConflictError);
		expect((err as DocumentFilenameConflictError).existingDocumentId).toBe('doc-old');
		expect(f.putCalls).toHaveLength(0);
		expect(f.enqueued).toHaveLength(0);
	});

	it('on a unique-index race, removes the just-uploaded object and reports the conflict', async () => {
		const f = makeFakes(undefined, { createThrows: Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'uq_documents_project_filename' }) });
		const usecase = new UploadDocumentUseCase(f.connectors, f.documents, f.pipelineJobs, f.storage, f.queue);
		await expect(usecase.execute({ projectId: PROJECT_ID, filename: 'spec.md', mimeType: 'text/markdown', buffer: Buffer.from('v2') })).rejects.toBeInstanceOf(DocumentFilenameConflictError);
		expect(f.putCalls).toHaveLength(1);
		expect(f.deleted).toEqual([f.putCalls[0]!.key]);
		expect(f.enqueued).toHaveLength(0);
	});
});
