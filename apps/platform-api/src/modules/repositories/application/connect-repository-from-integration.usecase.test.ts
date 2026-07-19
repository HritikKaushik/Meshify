import { describe, expect, it } from 'vitest';
import type { Queue } from 'bullmq';
import type { RepoIngestJobPayload } from '@meshify/queues';
import {
	ConnectRepositoryFromIntegrationUseCase,
	GitHubIntegrationNotFoundError,
	RepositoryAlreadyConnectedError,
	ResourceNotAccessibleError,
} from './connect-repository-from-integration.usecase.js';
import { ListIntegrationResourcesUseCase } from '../../integrations/application/list-integration-resources.usecase.js';
import {
	InMemoryIntegrationRepository,
	InMemoryIntegrationResourceRepository,
	InMemoryKnowledgeConnectorRepository,
	InMemoryPipelineJobRepository,
	InMemoryRepositoryRepository,
} from '@meshify/testing';
import { CredentialVault, ProviderRegistry, CURRENT_MANIFEST_VERSION, NO_CAPABILITIES } from '@meshify/providers';
import type { Provider, ResourceBrowsingCapable } from '@meshify/providers';
import { InMemoryCredentialStore, buildIntegration, fakeCipher } from '@meshify/providers/testing';

function pickerProvider(repos: Array<{ id: string; name: string; owner: string; shortName: string }>): Provider & ResourceBrowsingCapable {
	return {
		manifest: {
			id: 'github',
			manifestVersion: CURRENT_MANIFEST_VERSION,
			providerVersion: '1.0.0',
			displayName: 'GitHub',
			category: 'code',
			availability: 'available',
			capabilities: { ...NO_CAPABILITIES, resourcePicker: true },
			auth: { type: 'app_install' },
			iconKey: 'github',
			summary: 'gh',
		},
		listResources: async () => ({
			resources: repos.map((r) => ({ id: r.id, name: r.name, kind: 'repository', private: true, extra: { owner: r.owner, shortName: r.shortName, defaultBranch: 'main' } })),
		}),
	};
}

function harness(grantedRepos = [{ id: '42', name: 'acme/api', owner: 'acme', shortName: 'api' }]) {
	const integration = buildIntegration({ id: 'int-gh', provider: 'github', orgId: 'org-1', externalAccountId: '12345', status: 'active' });
	const integrations = new InMemoryIntegrationRepository([integration]);
	const resources = new InMemoryIntegrationResourceRepository();
	const connectors = new InMemoryKnowledgeConnectorRepository();
	const repositories = new InMemoryRepositoryRepository();
	const pipelineJobs = new InMemoryPipelineJobRepository();
	const registry = new ProviderRegistry();
	registry.register(pickerProvider(grantedRepos));
	const vault = new CredentialVault(new InMemoryCredentialStore(), fakeCipher);
	const listResources = new ListIntegrationResourcesUseCase(registry, integrations, resources, connectors, vault);
	const enqueued: Array<{ name: string; payload: RepoIngestJobPayload; opts: { jobId?: string } }> = [];
	const queue = { add: async (name: string, payload: RepoIngestJobPayload, opts: { jobId?: string }) => void enqueued.push({ name, payload, opts }) } as unknown as Queue<RepoIngestJobPayload>;
	const useCase = new ConnectRepositoryFromIntegrationUseCase(integrations, resources, listResources, connectors, repositories, pipelineJobs, queue);
	return { integrations, resources, connectors, repositories, pipelineJobs, enqueued, useCase };
}

describe('ConnectRepositoryFromIntegrationUseCase', () => {
	it('binds a granted repo: connector with canonical resourceIds, repo row with stable identity, ingest job enqueued', async () => {
		const h = harness();
		const result = await h.useCase.execute({ projectId: 'proj-1', orgId: 'org-1', integrationId: 'int-gh', githubRepoId: '42' });

		expect(result.repository).toMatchObject({ owner: 'acme', name: 'api', githubRepoId: '42', remoteUrl: 'https://github.com/acme/api', source: 'github' });
		const connector = await h.connectors.findById(result.repository.connectorId!);
		expect(connector).toMatchObject({ type: 'github', integrationId: 'int-gh' });
		expect(connector?.config.resourceIds).toEqual(['42']);
		expect(h.enqueued[0]).toMatchObject({ payload: { repositoryId: result.repository.id, projectId: 'proj-1' }, opts: { jobId: result.jobId } });
	});

	it('refreshes the inventory once for a freshly-granted repo (cache miss → live listing)', async () => {
		const h = harness([{ id: '77', name: 'acme/new-repo', owner: 'acme', shortName: 'new-repo' }]);
		const result = await h.useCase.execute({ projectId: 'proj-1', orgId: 'org-1', integrationId: 'int-gh', githubRepoId: '77' });
		expect(result.repository.githubRepoId).toBe('77');
		expect((await h.resources.findByResourceId('int-gh', '77'))?.name).toBe('acme/new-repo');
	});

	it('refuses repos outside the grant, duplicates, and cross-org integrations', async () => {
		const h = harness();
		await expect(h.useCase.execute({ projectId: 'p', orgId: 'org-1', integrationId: 'int-gh', githubRepoId: '999' })).rejects.toBeInstanceOf(ResourceNotAccessibleError);
		await h.useCase.execute({ projectId: 'proj-1', orgId: 'org-1', integrationId: 'int-gh', githubRepoId: '42' });
		await expect(h.useCase.execute({ projectId: 'proj-1', orgId: 'org-1', integrationId: 'int-gh', githubRepoId: '42' })).rejects.toBeInstanceOf(RepositoryAlreadyConnectedError);
		await expect(h.useCase.execute({ projectId: 'p', orgId: 'org-other', integrationId: 'int-gh', githubRepoId: '42' })).rejects.toBeInstanceOf(GitHubIntegrationNotFoundError);
	});
});
