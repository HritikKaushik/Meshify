import type { FileRepository, KnowledgeConnectorRepository, RepositoryRepository } from '@meshify/data-access';
import { RepositoryNotFoundError } from './sync-repository.usecase.js';

/** Narrow port over object storage — deletes an uploaded ZIP archive on teardown. */
export interface RepositoryObjectStore {
	deleteObject(key: string): Promise<void>;
}

/** Narrow port over the vector store — purges a repository's embedded code chunks. */
export interface RepositoryVectorStore {
	deleteBySourcePaths(collection: string, paths: string[]): Promise<void>;
}

export interface DeleteRepositoryCommand {
	/** The isolation-guard-resolved project — carries the Qdrant code collection name. */
	project: { id: string; qdrantCollectionCode: string };
	repositoryId: string;
}

/**
 * Disconnects a repository from a project: removes its embedded code chunks
 * from the project's Qdrant code collection (keyed by the file paths recorded
 * in `files`), deletes its uploaded ZIP archive from object storage (GitHub
 * repos have none), and deletes the repository row — its `files` rows go with
 * it via ON DELETE CASCADE. Vector/archive cleanup is best-effort (logged, not
 * fatal) so a stuck external delete can't wedge the user-visible disconnect;
 * the DB row is the source of truth for the repository list. Cross-project
 * deletes are rejected.
 */
export class DeleteRepositoryUseCase {
	constructor(
		private readonly repositories: RepositoryRepository,
		private readonly files: FileRepository,
		private readonly storage: RepositoryObjectStore,
		private readonly vectors: RepositoryVectorStore,
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly logError: (context: Record<string, unknown>, message: string) => void = () => {}
	) {}

	async execute(command: DeleteRepositoryCommand): Promise<void> {
		const repository = await this.repositories.findById(command.repositoryId);
		if (!repository || repository.projectId !== command.project.id) {
			throw new RepositoryNotFoundError(command.repositoryId);
		}

		// Purge embedded code chunks by the repo's known file paths.
		const files = await this.files.listByRepository(command.repositoryId).catch(() => []);
		const paths = files.map((f) => f.path);
		if (paths.length > 0) {
			await this.vectors
				.deleteBySourcePaths(command.project.qdrantCollectionCode, paths)
				.catch((err) => this.logError({ err, repositoryId: repository.id }, 'failed to delete repository vectors'));
		}

		// Remove the uploaded archive (ZIP repos only).
		if (repository.archiveObjectKey) {
			await this.storage
				.deleteObject(repository.archiveObjectKey)
				.catch((err) => this.logError({ err, repositoryId: repository.id }, 'failed to delete repository archive'));
		}

		// Delete the owning connector (cascades the repository + its files); fall
		// back to a direct row delete for any pre-migration repo without a connector.
		if (repository.connectorId) {
			await this.connectors.delete(repository.connectorId);
		} else {
			await this.repositories.delete(repository.id);
		}
	}
}
