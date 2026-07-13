import type pg from 'pg';
import type { Repository, RepositorySyncStatus } from './repository.entity.js';
import type { CreateRepositoryInput, RepositoryRepository } from './repository.repository.js';

interface RepositoryRow {
	id: string;
	project_id: string;
	source: string;
	remote_url: string | null;
	default_branch: string | null;
	last_synced_commit: string | null;
	sync_status: string;
	archive_object_key: string | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: RepositoryRow): Repository {
	return {
		id: row.id,
		projectId: row.project_id,
		source: row.source as Repository['source'],
		remoteUrl: row.remote_url,
		defaultBranch: row.default_branch,
		lastSyncedCommit: row.last_synced_commit,
		syncStatus: row.sync_status as RepositorySyncStatus,
		archiveObjectKey: row.archive_object_key,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresRepositoryRepository implements RepositoryRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateRepositoryInput): Promise<Repository> {
		const { rows } = await this.pool.query<RepositoryRow>(
			`insert into repositories (id, project_id, source, remote_url, archive_object_key)
			 values ($1, $2, $3, $4, $5) returning *`,
			[input.id, input.projectId, input.source, input.remoteUrl ?? null, input.archiveObjectKey ?? null]
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

	async markSynced(id: string, commitSha: string | null, defaultBranch: string | null): Promise<void> {
		await this.pool.query(
			`update repositories set sync_status = 'synced', last_synced_commit = coalesce($2, last_synced_commit),
			 default_branch = coalesce($3, default_branch), updated_at = now() where id = $1`,
			[id, commitSha, defaultBranch]
		);
	}
}
