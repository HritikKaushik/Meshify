import type { FileStatus, RepoFile } from './file.entity.js';

export interface UpsertFileInput {
	id: string;
	projectId: string;
	repositoryId: string;
	path: string;
	language: string | null;
	sizeBytes: number;
	contentHash: string;
}

export interface FileRepository {
	/** Insert or, if (repository_id, path) already exists, refresh hash/size/language and reset status to pending. */
	upsert(input: UpsertFileInput): Promise<RepoFile>;
	/** `upsert` for a whole tree in one statement (a full ingest used to issue one round trip per file). */
	upsertMany(inputs: UpsertFileInput[]): Promise<RepoFile[]>;
	listByRepository(repositoryId: string): Promise<RepoFile[]>;
	updateStatusByRepository(repositoryId: string, from: FileStatus, to: FileStatus): Promise<void>;
	/** Batch lookup by exact paths — the ConnectorEngine's content-hash ledger read. */
	findByRepositoryAndPaths(repositoryId: string, paths: string[]): Promise<RepoFile[]>;
	/** Flip a specific path set (the engine's per-batch embedded stamp). */
	updateStatusForPaths(repositoryId: string, paths: string[], status: FileStatus): Promise<void>;
	markDeleted(repositoryId: string, paths: string[]): Promise<void>;
}
