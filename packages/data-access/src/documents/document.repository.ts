import type { Document, DocumentStatus } from './document.entity.js';

export interface CreateDocumentInput {
	id: string;
	projectId: string;
	sourceType: Document['sourceType'];
	filename: string;
	objectStorageKey: string;
	contentHash: string;
}

export interface DocumentRepository {
	create(input: CreateDocumentInput): Promise<Document>;
	findById(id: string): Promise<Document | undefined>;
	/** Dedupe check: an existing document for this project with the same content, regardless of filename. */
	findByProjectAndHash(projectId: string, contentHash: string): Promise<Document | undefined>;
	updateStatus(id: string, status: DocumentStatus): Promise<void>;
}
