export type DocumentSourceType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'readme';
export type DocumentStatus = 'pending' | 'parsed' | 'embedded' | 'failed';

export interface Document {
	id: string;
	projectId: string;
	/** The singleton `documents` KnowledgeConnector this file belongs to. Nullable only for pre-migration rows. */
	connectorId: string | null;
	sourceType: DocumentSourceType;
	filename: string;
	objectStorageKey: string;
	contentHash: string;
	status: DocumentStatus;
	createdAt: Date;
	updatedAt: Date;
}

const EXTENSION_TO_SOURCE_TYPE: Record<string, DocumentSourceType> = {
	pdf: 'pdf',
	docx: 'docx',
	pptx: 'pptx',
	txt: 'txt',
	md: 'md',
	markdown: 'md',
};

export function sourceTypeFromFilename(filename: string): DocumentSourceType {
	const base = filename.split('/').pop() ?? filename;
	if (/^readme(\.\w+)?$/i.test(base)) return 'readme';

	const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
	const sourceType = EXTENSION_TO_SOURCE_TYPE[ext];
	if (!sourceType) {
		throw new Error(`Unsupported document type for "${filename}" — allowed: pdf, docx, pptx, txt, md`);
	}
	return sourceType;
}
