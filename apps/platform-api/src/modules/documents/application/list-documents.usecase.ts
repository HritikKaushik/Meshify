import type { Document, DocumentRepository } from '@meshify/data-access';

/** Lists a project's ingested documents (newest first) for the Documents screen. */
export class ListDocumentsUseCase {
	constructor(private readonly documents: DocumentRepository) {}

	execute(projectId: string): Promise<Document[]> {
		return this.documents.listByProject(projectId);
	}
}
