import type pg from 'pg';
import type { FileStatus, RepoFile } from './file.entity.js';
import type { FileRepository, UpsertFileInput } from './file.repository.js';

interface FileRow {
	id: string;
	project_id: string;
	repository_id: string | null;
	path: string;
	language: string | null;
	size_bytes: number;
	content_hash: string;
	object_storage_key: string | null;
	status: string;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: FileRow): RepoFile {
	return {
		id: row.id,
		projectId: row.project_id,
		repositoryId: row.repository_id,
		path: row.path,
		language: row.language,
		sizeBytes: row.size_bytes,
		contentHash: row.content_hash,
		objectStorageKey: row.object_storage_key,
		status: row.status as FileStatus,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresFileRepository implements FileRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: UpsertFileInput): Promise<RepoFile> {
		const { rows } = await this.pool.query<FileRow>(
			`insert into files (id, project_id, repository_id, path, language, size_bytes, content_hash)
			 values ($1, $2, $3, $4, $5, $6, $7)
			 on conflict (repository_id, path) where repository_id is not null
			 do update set language = excluded.language, size_bytes = excluded.size_bytes,
			               content_hash = excluded.content_hash, status = 'pending', updated_at = now()
			 returning *`,
			[input.id, input.projectId, input.repositoryId, input.path, input.language, input.sizeBytes, input.contentHash]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into files returned no row');
		return toDomain(row);
	}

	async listByRepository(repositoryId: string): Promise<RepoFile[]> {
		const { rows } = await this.pool.query<FileRow>('select * from files where repository_id = $1 order by path', [repositoryId]);
		return rows.map(toDomain);
	}

	async updateStatusByRepository(repositoryId: string, from: FileStatus, to: FileStatus): Promise<void> {
		await this.pool.query('update files set status = $3, updated_at = now() where repository_id = $1 and status = $2', [repositoryId, from, to]);
	}

	async findByRepositoryAndPaths(repositoryId: string, paths: string[]): Promise<RepoFile[]> {
		if (paths.length === 0) return [];
		const { rows } = await this.pool.query<FileRow>('select * from files where repository_id = $1 and path = any($2)', [repositoryId, paths]);
		return rows.map(toDomain);
	}

	async updateStatusForPaths(repositoryId: string, paths: string[], status: FileStatus): Promise<void> {
		if (paths.length === 0) return;
		await this.pool.query('update files set status = $3, updated_at = now() where repository_id = $1 and path = any($2)', [repositoryId, paths, status]);
	}

	async markDeleted(repositoryId: string, paths: string[]): Promise<void> {
		if (paths.length === 0) return;
		await this.pool.query("update files set status = 'deleted', updated_at = now() where repository_id = $1 and path = any($2)", [repositoryId, paths]);
	}
}
