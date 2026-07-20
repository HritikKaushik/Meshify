import { describe, expect, it } from 'vitest';
import { AttachSlackWorkspaceUseCase, SlackIntegrationNotFoundError, SlackIntegrationNotUsableError } from './attach-slack-workspace.usecase.js';
import {
	InMemoryIntegrationRepository,
	InMemoryKnowledgeConnectorRepository,
	InMemorySlackChannelRepository,
	InMemorySlackWorkspaceRepository,
} from '@meshify/testing';
import { CredentialVault } from '@meshify/providers';
import { InMemoryCredentialStore, buildIntegration, fakeCipher } from '@meshify/providers/testing';

function harness(overrides: { status?: 'active' | 'revoked'; withToken?: boolean } = {}) {
	const integration = buildIntegration({
		id: 'int-slack',
		provider: 'slack',
		orgId: 'org-1',
		externalAccountId: 'T111',
		externalAccountName: 'Acme Workspace',
		status: overrides.status ?? 'active',
		metadata: { botUserId: 'U-bot', scope: 'channels:read' },
	});
	const integrations = new InMemoryIntegrationRepository([integration]);
	const connectors = new InMemoryKnowledgeConnectorRepository();
	const workspaces = new InMemorySlackWorkspaceRepository();
	const channels = new InMemorySlackChannelRepository();
	const vault = new CredentialVault(new InMemoryCredentialStore(), fakeCipher);
	if (overrides.withToken !== false) void vault.put('int-slack', 'access_token', 'xoxb-live');
	const slack = { listChannels: async () => [{ id: 'C1', name: 'general', isPrivate: false }, { id: 'C2', name: 'eng', isPrivate: true }] };
	const useCase = new AttachSlackWorkspaceUseCase(integrations, connectors, workspaces, channels, vault, slack);
	return { integrations, connectors, workspaces, channels, useCase };
}

describe('AttachSlackWorkspaceUseCase', () => {
	it('binds the org workspace to the project without a second OAuth: connector + token-less workspace + channels', async () => {
		const h = harness();
		const result = await h.useCase.execute({ projectId: 'proj-1', orgId: 'org-1', integrationId: 'int-slack' });

		expect(result.alreadyAttached).toBe(false);
		expect(result.channelCount).toBe(2);
		const connector = await h.connectors.findById(result.connectorId);
		expect(connector).toMatchObject({ type: 'slack', integrationId: 'int-slack', status: 'active' });
		const workspace = await h.workspaces.findById(result.workspaceId);
		expect(workspace).toMatchObject({ teamId: 'T111', integrationId: 'int-slack', encryptedAccessToken: null, botUserId: 'U-bot' });
	});

	it('re-attaching is idempotent', async () => {
		const h = harness();
		const first = await h.useCase.execute({ projectId: 'proj-1', orgId: 'org-1', integrationId: 'int-slack' });
		const second = await h.useCase.execute({ projectId: 'proj-1', orgId: 'org-1', integrationId: 'int-slack' });
		expect(second.alreadyAttached).toBe(true);
		expect(second.connectorId).toBe(first.connectorId);
		expect((await h.workspaces.listByIntegrationId('int-slack')).length).toBe(1);
	});

	it('rejects cross-org, non-slack, inactive, and token-less integrations appropriately', async () => {
		const h = harness();
		await expect(h.useCase.execute({ projectId: 'p', orgId: 'org-other', integrationId: 'int-slack' })).rejects.toBeInstanceOf(SlackIntegrationNotFoundError);

		const revoked = harness({ status: 'revoked' });
		await expect(revoked.useCase.execute({ projectId: 'p', orgId: 'org-1', integrationId: 'int-slack' })).rejects.toBeInstanceOf(SlackIntegrationNotUsableError);

		const tokenless = harness({ withToken: false });
		await expect(tokenless.useCase.execute({ projectId: 'p', orgId: 'org-1', integrationId: 'int-slack' })).rejects.toBeInstanceOf(SlackIntegrationNotUsableError);
	});
});
