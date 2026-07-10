export type ProjectStatus = 'active' | 'archived';

export interface Project {
	id: string;
	orgId: string;
	name: string;
	description: string | null;
	status: ProjectStatus;
	llmProfile: string;
	embeddingProfile: string;
	qdrantCollectionDocs: string;
	qdrantCollectionCode: string;
	rocketrideDocsIngestPipelineId: string;
	rocketrideCodeIngestPipelineId: string;
	rocketrideChatPipelineId: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

/** Embedding vector dimensions, keyed by RocketRide embedding profile — needed to provision Qdrant collections correctly. */
export const EMBEDDING_DIMENSIONS: Record<string, number> = {
	'text-embedding-3-large': 3072,
	'text-embedding-3-small': 1536,
	'text-embedding-ada-002': 1536,
	miniLM: 384,
	mpnet: 768,
	miniAll: 384,
};

export function embeddingDimensionFor(profile: string): number {
	const dimension = EMBEDDING_DIMENSIONS[profile];
	if (!dimension) {
		throw new Error(`Unknown embedding profile "${profile}" — add its vector dimension to EMBEDDING_DIMENSIONS`);
	}
	return dimension;
}

export function qdrantCollectionName(projectId: string, target: 'documents' | 'code'): string {
	return `proj_${projectId.replace(/-/g, '')}_${target}`;
}
