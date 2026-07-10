import type { ProjectRepository } from '@meshify/data-access';
import type { QdrantCollectionProvisioner } from '../infrastructure/qdrant-collection.provisioner.js';

export class ProjectNotFoundError extends Error {
	constructor(id: string) {
		super(`Project "${id}" does not exist`);
		this.name = 'ProjectNotFoundError';
	}
}

/**
 * Deletes the Qdrant collections BEFORE the Postgres row, per the isolation
 * design: the collection is the tenancy boundary, so search access must be
 * cut off before the row that authorized it disappears — never the reverse
 * order, which would leave a moment where the collection is queryable but
 * ownerless.
 */
export class DeleteProjectUseCase {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly qdrant: QdrantCollectionProvisioner
	) {}

	async execute(projectId: string): Promise<void> {
		const project = await this.projects.findById(projectId);
		if (!project) throw new ProjectNotFoundError(projectId);

		await this.qdrant.deleteCollection(project.qdrantCollectionDocs);
		await this.qdrant.deleteCollection(project.qdrantCollectionCode);
		await this.projects.delete(project.id);
	}
}
