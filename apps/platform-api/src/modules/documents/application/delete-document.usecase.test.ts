import { describe, expect, it, vi } from 'vitest';
import type { Document } from '@meshify/data-access';
import { InMemoryDocumentRepository, buildDocument } from '@meshify/testing';
import { DeleteDocumentUseCase, DocumentNotFoundError } from './delete-document.usecase.js';

const PROJECT = { id: 'proj-1', qdrantCollectionDocs: 'proj_docs' };

function makeDeps(...seed: Document[]) {
	const documents = new InMemoryDocumentRepository(seed);
	const storage = { deleteObject: vi.fn(async () => {}) };
	const vectors = { deleteByFilter: vi.fn(async () => {}) };
	return { documents, storage, vectors };
}

describe('DeleteDocumentUseCase', () => {
	it('404s when the document does not exist', async () => {
		const { documents, storage, vectors } = makeDeps();
		await expect(new DeleteDocumentUseCase(documents, storage, vectors).execute({ project: PROJECT, documentId: 'missing' })).rejects.toBeInstanceOf(DocumentNotFoundError);
	});

	it('refuses to delete a document belonging to another project (isolation)', async () => {
		const { documents, storage, vectors } = makeDeps(buildDocument({ id: 'doc-1', projectId: 'someone-else' }));
		await expect(new DeleteDocumentUseCase(documents, storage, vectors).execute({ project: PROJECT, documentId: 'doc-1' })).rejects.toBeInstanceOf(DocumentNotFoundError);
		expect(vectors.deleteByFilter).not.toHaveBeenCalled();
		expect(await documents.findById('doc-1')).toBeDefined();
	});

	it('purges vectors, object, and row', async () => {
		const doc = buildDocument({ id: 'doc-1', filename: 'refund-runbook.md' });
		const { documents, storage, vectors } = makeDeps(doc);
		await new DeleteDocumentUseCase(documents, storage, vectors).execute({ project: PROJECT, documentId: 'doc-1' });
		expect(vectors.deleteByFilter).toHaveBeenCalledWith('proj_docs', { sourcePathExact: 'refund-runbook.md' });
		expect(storage.deleteObject).toHaveBeenCalledWith(doc.objectStorageKey);
		expect(await documents.findById('doc-1')).toBeUndefined();
	});

	it('still removes the row when external cleanup fails (best-effort teardown)', async () => {
		const { documents } = makeDeps(buildDocument({ id: 'doc-1' }));
		const storage = { deleteObject: vi.fn(async () => { throw new Error('s3 down'); }) };
		const vectors = { deleteByFilter: vi.fn(async () => { throw new Error('qdrant down'); }) };
		const errors: string[] = [];
		await new DeleteDocumentUseCase(documents, storage, vectors, (_ctx, msg) => errors.push(msg)).execute({ project: PROJECT, documentId: 'doc-1' });
		expect(await documents.findById('doc-1')).toBeUndefined();
		expect(errors).toHaveLength(2);
	});
});
