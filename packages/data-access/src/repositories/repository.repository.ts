import type { Repository, RepositorySyncStatus } from './repository.entity.js';

export interface CreateRepositoryInput {
	id: string;
	projectId: string;
	source: Repository['source'];
	remoteUrl?: string;
	archiveObjectKey?: string;
}

export interface RepositoryRepository {
	create(input: CreateRepositoryInput): Promise<Repository>;
	findById(id: string): Promise<Repository | undefined>;
	listByProject(projectId: string): Promise<Repository[]>;
	/** Single-row aggregate for project stats — counts + latest activity without loading rows. */
	statsByProject(projectId: string): Promise<{ total: number; synced: number; lastUpdatedAt: Date | null }>;
	updateSyncStatus(id: string, status: RepositorySyncStatus): Promise<void>;
	markSynced(id: string, commitSha: string | null, defaultBranch: string | null): Promise<void>;
	/** Delete a repository row and (via ON DELETE CASCADE) its files. Vector/archive cleanup is the caller's job. */
	delete(id: string): Promise<void>;
}
