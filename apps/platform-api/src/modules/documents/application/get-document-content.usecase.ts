import type { DocumentRepository } from '@meshify/data-access';
import { DocumentNotFoundError } from './delete-document.usecase.js';

/** Narrow port over object storage — only reading a document's raw upload. */
export interface DocumentContentStore {
	getObject(key: string): Promise<Buffer>;
}

const CONTENT_TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	txt: 'text/plain; charset=utf-8',
	md: 'text/markdown; charset=utf-8',
	readme: 'text/markdown; charset=utf-8',
};

export interface DocumentContent {
	buffer: Buffer;
	contentType: string;
	filename: string;
}

/**
 * Returns a project document's raw upload from object storage — used by the
 * Documents grid to render PDF thumbnails. Cross-project reads are rejected (the
 * document must belong to the isolation-guard-resolved project).
 */
export class GetDocumentContentUseCase {
	constructor(
		private readonly documents: DocumentRepository,
		private readonly storage: DocumentContentStore
	) {}

	async execute(command: { projectId: string; documentId: string }): Promise<DocumentContent> {
		const document = await this.documents.findById(command.documentId);
		if (!document || document.projectId !== command.projectId) throw new DocumentNotFoundError(command.documentId);
		const buffer = await this.storage.getObject(document.objectStorageKey);
		return { buffer, contentType: CONTENT_TYPES[document.sourceType] ?? 'application/octet-stream', filename: document.filename };
	}
}
