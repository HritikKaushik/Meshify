import { randomUUID } from 'node:crypto';
import { embeddingDimensionFor, qdrantCollectionName, type Project, type ProjectRepository } from '@meshify/data-access';
import type { QdrantCollectionProvisioner } from '@meshify/vector-store';

export class OrgNotFoundError extends Error {
	constructor(orgId: string) {
		super(`Organization "${orgId}" does not exist`);
		this.name = 'OrgNotFoundError';
	}
}

export interface CreateProjectCommand {
	orgId: string;
	name: string;
	description?: string;
	llmProfile: string;
	embeddingProfile: string;
}

/**
 * Provisions physical isolation (two Qdrant collections) and the Postgres
 * record for a new project. Deliberately does NOT start any RocketRide
 * pipeline here — pipelines are resolved lazily on first ingest/chat via
 * PipelineRegistry.ensure*Pipeline(), using the GUIDs generated below.
 * Project creation must stay fast and must not depend on RocketRide being
 * reachable.
 */
export class CreateProjectUseCase {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly qdrant: QdrantCollectionProvisioner
	) {}

	async execute(command: CreateProjectCommand): Promise<Project> {
		if (!(await this.projects.orgExists(command.orgId))) {
			throw new OrgNotFoundError(command.orgId);
		}

		const id = randomUUID();
		const qdrantCollectionDocs = qdrantCollectionName(id, 'documents');
		const qdrantCollectionCode = qdrantCollectionName(id, 'code');
		const dimension = embeddingDimensionFor(command.embeddingProfile);

		await this.qdrant.ensureCollection(qdrantCollectionDocs, dimension);
		try {
			await this.qdrant.ensureCollection(qdrantCollectionCode, dimension);
		} catch (err) {
			await this.qdrant.deleteCollection(qdrantCollectionDocs);
			throw err;
		}

		try {
			return await this.projects.create({
				id,
				orgId: command.orgId,
				name: command.name,
				description: command.description ?? null,
				llmProfile: command.llmProfile,
				embeddingProfile: command.embeddingProfile,
				qdrantCollectionDocs,
				qdrantCollectionCode,
				rocketrideDocsIngestPipelineId: randomUUID(),
				rocketrideCodeIngestPipelineId: randomUUID(),
				rocketrideChatPipelineId: randomUUID(),
			});
		} catch (err) {
			// Best-effort rollback: don't leave orphaned Qdrant collections behind on a failed insert.
			await Promise.allSettled([this.qdrant.deleteCollection(qdrantCollectionDocs), this.qdrant.deleteCollection(qdrantCollectionCode)]);
			throw err;
		}
	}
}
