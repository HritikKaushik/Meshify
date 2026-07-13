import type { DocumentRepository } from '@meshify/data-access';

export class DocumentNotFoundError extends Error {
	constructor(documentId: string) {
		super(`Document "${documentId}" not found`);
		this.name = 'DocumentNotFoundError';
	}
}

/** Narrow port over object storage — only the delete a document teardown needs. */
export interface DocumentObjectStore {
	deleteObject(key: string): Promise<void>;
}

/** Narrow port over the vector store — deletes a document's embedded chunks. */
export interface DocumentVectorStore {
	deleteByFilter(collection: string, filters: { sourcePathExact: string }): Promise<void>;
}

export interface DeleteDocumentCommand {
	/** The isolation-guard-resolved project — carries the Qdrant docs collection name. */
	project: { id: string; qdrantCollectionDocs: string };
	documentId: string;
}

/**
 * Removes an ingested document end to end: its embedded chunks in Qdrant, its
 * raw upload in object storage, and its Postgres row. Storage/vector cleanup is
 * best-effort (logged, not fatal) so a stuck external delete can't wedge the
 * user-visible removal — the DB row is the source of truth for the Documents
 * list, and orphaned blobs/points are safe to reap later. Cross-project deletes
 * are rejected (the document must belong to the resolved project).
 */
export class DeleteDocumentUseCase {
	constructor(
		private readonly documents: DocumentRepository,
		private readonly storage: DocumentObjectStore,
		private readonly vectors: DocumentVectorStore,
		private readonly logError: (context: Record<string, unknown>, message: string) => void = () => {}
	) {}

	async execute(command: DeleteDocumentCommand): Promise<void> {
		const document = await this.documents.findById(command.documentId);
		if (!document || document.projectId !== command.project.id) {
			throw new DocumentNotFoundError(command.documentId);
		}

		// Purge embedded chunks (keyed by source_path = filename in the docs collection).
		await this.vectors
			.deleteByFilter(command.project.qdrantCollectionDocs, { sourcePathExact: document.filename })
			.catch((err) => this.logError({ err, documentId: document.id }, 'failed to delete document vectors'));

		// Remove the raw upload.
		await this.storage
			.deleteObject(document.objectStorageKey)
			.catch((err) => this.logError({ err, documentId: document.id }, 'failed to delete document object'));

		await this.documents.delete(document.id);
	}
}
