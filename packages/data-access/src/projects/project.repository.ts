import type { Project } from './project.entity.js';

export interface CreateProjectInput {
	id: string;
	orgId: string;
	name: string;
	description: string | null;
	llmProfile: string;
	embeddingProfile: string;
	qdrantCollectionDocs: string;
	qdrantCollectionCode: string;
	rocketrideDocsIngestPipelineId: string;
	rocketrideCodeIngestPipelineId: string;
	rocketrideChatPipelineId: string;
}

export interface ProjectRepository {
	orgExists(orgId: string): Promise<boolean>;
	create(input: CreateProjectInput): Promise<Project>;
	findById(id: string): Promise<Project | undefined>;
	findByOrgId(orgId: string): Promise<Project[]>;
	/** Every live project across all orgs - for platform-wide sweeps (index backfills, retention). */
	listAll(): Promise<Project[]>;
	/** Hard delete — the caller is responsible for deleting the associated Qdrant collections first. */
	delete(id: string): Promise<void>;
}
