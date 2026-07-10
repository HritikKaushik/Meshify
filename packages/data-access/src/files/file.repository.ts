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
	listByRepository(repositoryId: string): Promise<RepoFile[]>;
	updateStatusByRepository(repositoryId: string, from: FileStatus, to: FileStatus): Promise<void>;
	markDeleted(repositoryId: string, paths: string[]): Promise<void>;
}
