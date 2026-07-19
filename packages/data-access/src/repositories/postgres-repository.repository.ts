import type pg from 'pg';
import type { Repository, RepositorySyncStatus } from './repository.entity.js';
import type { CreateRepositoryInput, RepositoryRepository } from './repository.repository.js';

interface RepositoryRow {
	id: string;
	project_id: string;
	connector_id: string | null;
	source: string;
	remote_url: string | null;
	default_branch: string | null;
	last_synced_commit: string | null;
	sync_status: string;
	archive_object_key: string | null;
	github_repo_id: string | null;
	owner: string | null;
	name: string | null;
	last_synced_at: Date | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: RepositoryRow): Repository {
	return {
		id: row.id,
		projectId: row.project_id,
		connectorId: row.connector_id,
		source: row.source as Repository['source'],
		remoteUrl: row.remote_url,
		defaultBranch: row.default_branch,
		lastSyncedCommit: row.last_synced_commit,
		syncStatus: row.sync_status as RepositorySyncStatus,
		archiveObjectKey: row.archive_object_key,
		githubRepoId: row.github_repo_id,
		owner: row.owner,
		name: row.name,
		lastSyncedAt: row.last_synced_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresRepositoryRepository implements RepositoryRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateRepositoryInput): Promise<Repository> {
		const { rows } = await this.pool.query<RepositoryRow>(
			`insert into repositories (id, project_id, connector_id, source, remote_url, archive_object_key, owner, name, github_repo_id)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
			[
				input.id,
				input.projectId,
				input.connectorId,
				input.source,
				input.remoteUrl ?? null,
				input.archiveObjectKey ?? null,
				input.owner ?? null,
				input.name ?? null,
				input.githubRepoId ?? null,
			]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into repositories returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<Repository | undefined> {
		const { rows } = await this.pool.query<RepositoryRow>('select * from repositories where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByConnectorId(connectorId: string): Promise<Repository | undefined> {
		const { rows } = await this.pool.query<RepositoryRow>('select * from repositories where connector_id = $1', [connectorId]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByProject(projectId: string): Promise<Repository[]> {
		const { rows } = await this.pool.query<RepositoryRow>('select * from repositories where project_id = $1 order by created_at', [projectId]);
		return rows.map(toDomain);
	}

	async updateSyncStatus(id: string, status: RepositorySyncStatus): Promise<void> {
		await this.pool.query('update repositories set sync_status = $2, updated_at = now() where id = $1', [id, status]);
	}

	async delete(id: string): Promise<void> {
		// files.repository_id has ON DELETE CASCADE, so this also removes the repo's file rows.
		await this.pool.query('delete from repositories where id = $1', [id]);
	}

	async statsByProject(projectId: string): Promise<{ total: number; synced: number; lastUpdatedAt: Date | null }> {
		const { rows } = await this.pool.query<{ total: number; synced: number; last_updated_at: Date | null }>(
			`select count(*)::int as total,
			        count(*) filter (where sync_status = 'synced')::int as synced,
			        max(updated_at) as last_updated_at
			 from repositories where project_id = $1`,
			[projectId]
		);
		const row = rows[0]!;
		return { total: row.total, synced: row.synced, lastUpdatedAt: row.last_updated_at };
	}

	async markSynced(id: string, commitSha: string | null, defaultBranch: string | null): Promise<void> {
		await this.pool.query(
			`update repositories set sync_status = 'synced', last_synced_commit = coalesce($2, last_synced_commit),
			 default_branch = coalesce($3, default_branch), last_synced_at = now(), updated_at = now() where id = $1`,
			[id, commitSha, defaultBranch]
		);
	}

	async findByGitHubRepoId(githubRepoId: string): Promise<Repository[]> {
		const { rows } = await this.pool.query<RepositoryRow>('select * from repositories where github_repo_id = $1 order by created_at', [githubRepoId]);
		return rows.map(toDomain);
	}

	async findByOwnerAndName(owner: string, name: string): Promise<Repository[]> {
		const { rows } = await this.pool.query<RepositoryRow>(
			'select * from repositories where lower(owner) = lower($1) and lower(name) = lower($2) order by created_at',
			[owner, name]
		);
		return rows.map(toDomain);
	}

	async updateGitHubIdentity(id: string, input: { githubRepoId?: string; owner?: string; name?: string; remoteUrl?: string }): Promise<void> {
		await this.pool.query(
			`update repositories
			 set github_repo_id = coalesce($2, github_repo_id),
			     owner = coalesce($3, owner),
			     name = coalesce($4, name),
			     remote_url = coalesce($5, remote_url),
			     updated_at = now()
			 where id = $1`,
			[id, input.githubRepoId ?? null, input.owner ?? null, input.name ?? null, input.remoteUrl ?? null]
		);
	}
}
