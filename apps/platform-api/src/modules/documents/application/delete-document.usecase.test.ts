import { describe, expect, it } from 'vitest';
import type { Document, DocumentRepository } from '@meshify/data-access';
import { DeleteDocumentUseCase, DocumentNotFoundError } from './delete-document.usecase.js';

const PROJECT = { id: '11111111-1111-4111-8111-111111111111', qdrantCollectionDocs: 'proj_docs' };

function makeFakes(doc?: Partial<Document>) {
	const deleted: string[] = [];
	const documents = {
		async findById() {
			return doc as Document | undefined;
		},
		async delete(id: string) {
			deleted.push(id);
		},
	} as unknown as DocumentRepository;

	const objectDeletes: string[] = [];
	const storage = {
		async deleteObject(key: string) {
			objectDeletes.push(key);
		},
	};

	const vectorDeletes: Array<{ collection: string; sourcePathExact: string }> = [];
	const vectors = {
		async deleteByFilter(collection: string, filters: { sourcePathExact: string }) {
			vectorDeletes.push({ collection, sourcePathExact: filters.sourcePathExact });
		},
	};

	return { documents, storage, vectors, deleted, objectDeletes, vectorDeletes };
}

const DOC: Partial<Document> = {
	id: 'doc-1',
	projectId: PROJECT.id,
	filename: 'refund-runbook.md',
	objectStorageKey: `projects/${PROJECT.id}/documents/doc-1/refund-runbook.md`,
	status: 'embedded',
};

describe('DeleteDocumentUseCase', () => {
	it('404s when the document does not exist', async () => {
		const f = makeFakes(undefined);
		const usecase = new DeleteDocumentUseCase(f.documents, f.storage, f.vectors);
		await expect(usecase.execute({ project: PROJECT, documentId: 'missing' })).rejects.toBeInstanceOf(DocumentNotFoundError);
		expect(f.deleted).toHaveLength(0);
	});

	it('refuses to delete a document belonging to another project (isolation)', async () => {
		const f = makeFakes({ ...DOC, projectId: 'someone-else' });
		const usecase = new DeleteDocumentUseCase(f.documents, f.storage, f.vectors);
		await expect(usecase.execute({ project: PROJECT, documentId: 'doc-1' })).rejects.toBeInstanceOf(DocumentNotFoundError);
		expect(f.deleted).toHaveLength(0);
		expect(f.vectorDeletes).toHaveLength(0);
	});

	it('purges vectors, object, and row', async () => {
		const f = makeFakes(DOC);
		const usecase = new DeleteDocumentUseCase(f.documents, f.storage, f.vectors);
		await usecase.execute({ project: PROJECT, documentId: 'doc-1' });
		expect(f.vectorDeletes).toEqual([{ collection: 'proj_docs', sourcePathExact: 'refund-runbook.md' }]);
		expect(f.objectDeletes).toEqual([DOC.objectStorageKey]);
		expect(f.deleted).toEqual(['doc-1']);
	});

	it('still removes the row when external cleanup fails (best-effort teardown)', async () => {
		const f = makeFakes(DOC);
		f.vectors.deleteByFilter = async () => {
			throw new Error('qdrant down');
		};
		f.storage.deleteObject = async () => {
			throw new Error('s3 down');
		};
		const errors: string[] = [];
		const usecase = new DeleteDocumentUseCase(f.documents, f.storage, f.vectors, (_ctx, msg) => errors.push(msg));
		await usecase.execute({ project: PROJECT, documentId: 'doc-1' });
		expect(f.deleted).toEqual(['doc-1']);
		expect(errors).toHaveLength(2);
	});
});
