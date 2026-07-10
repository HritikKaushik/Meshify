import { describe, expect, it } from 'vitest';
import type { Document, DocumentRepository, PipelineJobRepository } from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { Queue } from 'bullmq';
import type { DocumentIngestJobPayload } from '@meshify/queues';
import { UploadDocumentUseCase } from './upload-document.usecase.js';

function makeFakes(existing?: Partial<Document>) {
	const created: unknown[] = [];
	const documents = {
		async create(input: never) {
			created.push(input);
			return { ...(input as object), status: 'pending', createdAt: new Date(), updatedAt: new Date() } as unknown as Document;
		},
		async findById() {
			return undefined;
		},
		async findByProjectAndHash() {
			return existing as Document | undefined;
		},
		async updateStatus() {},
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
	const storage = {
		async putObject(key: string) {
			putCalls.push({ key });
		},
	} as unknown as ObjectStorageClient;

	const enqueued: Array<{ name: string; payload: DocumentIngestJobPayload; opts?: { jobId?: string } }> = [];
	const queue = {
		async add(name: string, payload: DocumentIngestJobPayload, opts?: { jobId?: string }) {
			enqueued.push({ name, payload, opts });
		},
	} as unknown as Queue<DocumentIngestJobPayload>;

	return { documents, pipelineJobs, storage, queue, created, jobsCreated, putCalls, enqueued };
}

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('UploadDocumentUseCase', () => {
	it('rejects empty files', async () => {
		const f = makeFakes();
		const usecase = new UploadDocumentUseCase(f.documents, f.pipelineJobs, f.storage, f.queue);
		await expect(usecase.execute({ projectId: PROJECT_ID, filename: 'a.md', mimeType: 'text/markdown', buffer: Buffer.alloc(0) })).rejects.toThrow(/empty/);
	});

	it('rejects unsupported MIME types before touching storage', async () => {
		const f = makeFakes();
		const usecase = new UploadDocumentUseCase(f.documents, f.pipelineJobs, f.storage, f.queue);
		await expect(usecase.execute({ projectId: PROJECT_ID, filename: 'a.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('x') })).rejects.toThrow(/Unsupported MIME/);
		expect(f.putCalls).toHaveLength(0);
		expect(f.enqueued).toHaveLength(0);
	});

	it('dedupes on content hash: already-embedded identical content produces no new document, upload, or job', async () => {
		const f = makeFakes({ id: 'existing-doc', status: 'embedded' });
		const usecase = new UploadDocumentUseCase(f.documents, f.pipelineJobs, f.storage, f.queue);

		const result = await usecase.execute({ projectId: PROJECT_ID, filename: 'same.md', mimeType: 'text/markdown', buffer: Buffer.from('identical content') });

		expect(result.deduped).toBe(true);
		expect(result.document.id).toBe('existing-doc');
		expect(f.created).toHaveLength(0);
		expect(f.putCalls).toHaveLength(0);
		expect(f.enqueued).toHaveLength(0);
	});

	it('happy path: stores the file under the project-scoped key, records document + job, enqueues with jobId', async () => {
		const f = makeFakes();
		const usecase = new UploadDocumentUseCase(f.documents, f.pipelineJobs, f.storage, f.queue);

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
});
