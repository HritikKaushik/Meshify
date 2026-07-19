import { randomUUID } from 'node:crypto';
import type { IntegrationRepository, IntegrationResourceRepository, KnowledgeConnectorRepository, PipelineJobRepository, Repository, RepositoryRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { RepoIngestJobPayload } from '@meshify/queues';
import type { ListIntegrationResourcesUseCase } from '../../integrations/application/list-integration-resources.usecase.js';

export interface ConnectRepositoryFromIntegrationCommand {
	projectId: string;
	orgId: string;
	integrationId: string;
	/** GitHub's numeric repo id, as listed by the resource picker. */
	githubRepoId: string;
}

/** Unknown id, wrong provider, and cross-org probe are indistinguishable (404). */
export class GitHubIntegrationNotFoundError extends Error {
	constructor() {
		super('GitHub integration not found');
		this.name = 'GitHubIntegrationNotFoundError';
	}
}

export class ResourceNotAccessibleError extends Error {
	constructor(resourceId: string) {
		super(`Repository ${resourceId} is not accessible to this installation — grant access on GitHub first`);
		this.name = 'ResourceNotAccessibleError';
	}
}

export class RepositoryAlreadyConnectedError extends Error {
	constructor(name: string) {
		super(`Repository ${name} is already connected to this project`);
		this.name = 'RepositoryAlreadyConnectedError';
	}
}

/**
 * Picker-based repository connect: the project binds a repository of the org's
 * GitHub installation by its stable id. The repo is validated against the
 * canonical resource inventory (refreshed live on a miss), so a project can
 * never bind a repo its org's grant doesn't reach.
 */
export class ConnectRepositoryFromIntegrationUseCase {
	constructor(
		private readonly integrations: IntegrationRepository,
		private readonly resources: IntegrationResourceRepository,
		private readonly listResources: ListIntegrationResourcesUseCase,
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly repositories: RepositoryRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly ingestQueue: Queue<RepoIngestJobPayload>
	) {}

	async execute(command: ConnectRepositoryFromIntegrationCommand): Promise<{ repository: Repository; jobId: string }> {
		const integration = await this.integrations.findByIdForOrg(command.integrationId, command.orgId);
		if (!integration || integration.provider !== 'github') throw new GitHubIntegrationNotFoundError();

		// Validate against the inventory; refresh it once if the repo was granted
		// after the last listing.
		let resource = await this.resources.findByResourceId(integration.id, command.githubRepoId);
		if (!resource || resource.removedAt) {
			await this.listResources.execute({ orgId: command.orgId, integrationId: integration.id });
			resource = await this.resources.findByResourceId(integration.id, command.githubRepoId);
		}
		if (!resource || resource.removedAt) throw new ResourceNotAccessibleError(command.githubRepoId);

		const fullName = resource.name; // 'owner/repo'
		const owner = typeof resource.metadata.owner === 'string' ? resource.metadata.owner : fullName.split('/')[0]!;
		const shortName = typeof resource.metadata.shortName === 'string' ? resource.metadata.shortName : fullName.split('/')[1]!;
		const remoteUrl = `https://github.com/${fullName}`;

		const duplicate = (await this.repositories.listByProject(command.projectId)).find((r) => r.githubRepoId === command.githubRepoId);
		if (duplicate) throw new RepositoryAlreadyConnectedError(fullName);

		const connector = await this.connectors.create({
			id: randomUUID(),
			projectId: command.projectId,
			type: 'github',
			displayName: fullName,
			status: 'connecting',
			config: { source: 'github', remoteUrl, integrationId: integration.id, resourceIds: [command.githubRepoId] },
			integrationId: integration.id,
		});

		const repository = await this.repositories.create({
			id: randomUUID(),
			projectId: command.projectId,
			connectorId: connector.id,
			source: 'github',
			remoteUrl,
			owner,
			name: shortName,
			githubRepoId: command.githubRepoId,
		});

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId: command.projectId,
			jobType: 'clone_repo',
			payload: { repositoryId: repository.id },
		});
		await this.ingestQueue.add('ingest', { pipelineJobId, repositoryId: repository.id, projectId: command.projectId }, { jobId: pipelineJobId });

		return { repository, jobId: pipelineJobId };
	}
}
