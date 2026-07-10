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

const OPENAI_EMBEDDING_PROFILES = new Set(['text-embedding-3-large', 'text-embedding-3-small', 'text-embedding-ada-002']);

/** RocketRide's llm_openai/llm_gemini profiles are provider-specific catalog entries — infer the provider from the stored profile name. */
export function llmProviderFromProfile(profile: string): 'openai' | 'gemini' {
	return profile.startsWith('gemini') || /^\d+-(pro|flash)/.test(profile) ? 'gemini' : 'openai';
}

export function embeddingProviderFromProfile(profile: string): 'openai' | 'transformer' {
	return OPENAI_EMBEDDING_PROFILES.has(profile) ? 'openai' : 'transformer';
}

export function apiKeyEnvVarFor(provider: 'openai' | 'gemini'): string {
	return provider === 'openai' ? 'ROCKETRIDE_OPENAI_KEY' : 'ROCKETRIDE_GEMINI_KEY';
}
