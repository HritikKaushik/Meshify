export type FileStatus = 'pending' | 'parsed' | 'embedded' | 'failed' | 'deleted';

export interface RepoFile {
	id: string;
	projectId: string;
	repositoryId: string | null;
	path: string;
	language: string | null;
	sizeBytes: number;
	contentHash: string;
	objectStorageKey: string | null;
	status: FileStatus;
	createdAt: Date;
	updatedAt: Date;
}
