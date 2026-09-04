import type { DocumentRepository, Project, ProjectRepository, RepositoryRepository } from '@meshify/data-access';
import type { QdrantCollectionProvisioner } from '@meshify/vector-store';

export class ProjectNotFoundError extends Error {
	constructor(id: string) {
		super(`Project "${id}" does not exist`);
		this.name = 'ProjectNotFoundError';
	}
}

/** The slice of object storage deletion needs (fakeable in tests). */
export interface ProjectObjectStorage {
	deleteObject(key: string): Promise<void>;
}

/** Stops a project's running RocketRide tasks (the PipelineRegistry). */
export interface ProjectPipelineTerminator {
	terminatePipeline(pipelineGuid: string, kind: 'ingest' | 'chat'): Promise<void>;
}

interface DeleteLogger {
	warn(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Deletes a project and everything it owns outside Postgres.
 *
 * Order matters. The Qdrant collections go first, BEFORE the Postgres row,
 * per the isolation design: the collection is the tenancy boundary, so search
 * access must be cut off before the row that authorized it disappears - never
 * the reverse, which would leave a moment where the collection is queryable
 * but ownerless. Then the project's RocketRide tasks are stopped and its
 * stored objects (uploaded documents, repository archives) removed; both are
 * best-effort, because an orphaned object or task costs a little storage
 * while a project that cannot be deleted costs the user. The row delete
 * cascades the rest.
 */
export class DeleteProjectUseCase {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly qdrant: QdrantCollectionProvisioner,
		private readonly documents: DocumentRepository,
		private readonly repositories: RepositoryRepository,
		private readonly storage: ProjectObjectStorage,
		private readonly pipelines: ProjectPipelineTerminator,
		private readonly logger?: DeleteLogger
	) {}

	async execute(projectId: string): Promise<void> {
		const project = await this.projects.findById(projectId);
		if (!project) throw new ProjectNotFoundError(projectId);

		await this.qdrant.deleteCollection(project.qdrantCollectionDocs);
		await this.qdrant.deleteCollection(project.qdrantCollectionCode);

		await this.terminatePipelines(project);
		await this.deleteStoredObjects(project);

		await this.projects.delete(project.id);
	}

	private async terminatePipelines(project: Project): Promise<void> {
		const pipelines: Array<[string, 'ingest' | 'chat']> = [
			[project.rocketrideChatPipelineId, 'chat'],
			[project.rocketrideDocsIngestPipelineId, 'ingest'],
			[project.rocketrideCodeIngestPipelineId, 'ingest'],
		];
		for (const [guid, kind] of pipelines) {
			await this.pipelines.terminatePipeline(guid, kind).catch((err: unknown) => {
				this.logger?.warn({ projectId: project.id, pipelineGuid: guid, kind, err: err instanceof Error ? err.message : String(err) }, 'could not stop a pipeline of a deleted project');
			});
		}
	}

	private async deleteStoredObjects(project: Project): Promise<void> {
		const [documents, repositories] = await Promise.all([this.documents.listByProject(project.id), this.repositories.listByProject(project.id)]);
		const keys = [...documents.map((d) => d.objectStorageKey), ...repositories.map((r) => r.archiveObjectKey)].filter((key): key is string => Boolean(key));
		for (const key of new Set(keys)) {
			await this.storage.deleteObject(key).catch((err: unknown) => {
				this.logger?.warn({ projectId: project.id, key, err: err instanceof Error ? err.message : String(err) }, 'could not delete a stored object of a deleted project');
			});
		}
	}
}
