export type RepositorySource = 'github' | 'zip';
export type RepositorySyncStatus = 'pending' | 'cloning' | 'synced' | 'failed';

export interface Repository {
	id: string;
	projectId: string;
	/** The `github` KnowledgeConnector this repository belongs to. Nullable only for pre-migration rows. */
	connectorId: string | null;
	source: RepositorySource;
	remoteUrl: string | null;
	defaultBranch: string | null;
	lastSyncedCommit: string | null;
	syncStatus: RepositorySyncStatus;
	archiveObjectKey: string | null;
	/** GitHub's numeric repo id (stable across renames) — the webhook resolution key. Backfilled lazily on sync; pg bigint arrives as a string. */
	githubRepoId: string | null;
	owner: string | null;
	name: string | null;
	lastSyncedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Parses "https://github.com/owner/repo(.git)" into owner/repo; throws on anything else. */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
	const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
	if (!match) throw new Error(`Not a valid GitHub repository URL: "${url}" (expected https://github.com/owner/repo)`);
	return { owner: match[1]!, repo: match[2]! };
}
