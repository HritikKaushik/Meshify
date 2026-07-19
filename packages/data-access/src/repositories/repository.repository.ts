import type { Repository, RepositorySyncStatus } from './repository.entity.js';

export interface CreateRepositoryInput {
	id: string;
	projectId: string;
	connectorId: string;
	source: Repository['source'];
	remoteUrl?: string;
	archiveObjectKey?: string;
	owner?: string;
	name?: string;
	githubRepoId?: string;
}

export interface RepositoryRepository {
	create(input: CreateRepositoryInput): Promise<Repository>;
	findById(id: string): Promise<Repository | undefined>;
	/** The repository backing a `github` connector (1:1). */
	findByConnectorId(connectorId: string): Promise<Repository | undefined>;
	listByProject(projectId: string): Promise<Repository[]>;
	/** Single-row aggregate for project stats — counts + latest activity without loading rows. */
	statsByProject(projectId: string): Promise<{ total: number; synced: number; lastUpdatedAt: Date | null }>;
	updateSyncStatus(id: string, status: RepositorySyncStatus): Promise<void>;
	markSynced(id: string, commitSha: string | null, defaultBranch: string | null): Promise<void>;
	/** Webhook resolution: every connected copy of this GitHub repo, across projects. */
	findByGitHubRepoId(githubRepoId: string): Promise<Repository[]>;
	/** Webhook resolution fallback for rows whose githubRepoId is not backfilled yet. */
	findByOwnerAndName(owner: string, name: string): Promise<Repository[]>;
	/** Stamp/refresh the stable GitHub identity (id, owner/name, url after renames). */
	updateGitHubIdentity(id: string, input: { githubRepoId?: string; owner?: string; name?: string; remoteUrl?: string }): Promise<void>;
	/** Delete a repository row and (via ON DELETE CASCADE) its files. Vector/archive cleanup is the caller's job. */
	delete(id: string): Promise<void>;
}
