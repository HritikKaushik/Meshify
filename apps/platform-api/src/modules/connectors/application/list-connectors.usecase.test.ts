import { describe, expect, it } from 'vitest';
import {
	InMemoryDocumentRepository,
	InMemoryKnowledgeConnectorRepository,
	InMemoryRepositoryRepository,
	InMemorySlackChannelRepository,
	InMemorySlackConversationRepository,
	InMemorySlackWorkspaceRepository,
	buildDocument,
	buildKnowledgeConnector,
	buildRepository,
	buildSlackChannel,
	buildSlackConversation,
	buildSlackWorkspace,
} from '@meshify/testing';
import { ListConnectorsUseCase } from './list-connectors.usecase.js';

describe('ListConnectorsUseCase', () => {
	it('returns a unified list of GitHub, Documents, and Slack sources with derived status + stats', async () => {
		const connectors = new InMemoryKnowledgeConnectorRepository([
			buildKnowledgeConnector({ id: 'conn-gh-1', type: 'github', displayName: 'acme/payments', status: 'connecting' }),
			buildKnowledgeConnector({ id: 'conn-docs-1', type: 'documents', displayName: 'Uploaded documents' }),
			buildKnowledgeConnector({ id: 'conn-slack-1', type: 'slack', displayName: 'Acme Workspace' }),
		]);
		const repositories = new InMemoryRepositoryRepository([buildRepository({ id: 'repo-1', connectorId: 'conn-gh-1', syncStatus: 'synced' })]);
		const documents = new InMemoryDocumentRepository([
			buildDocument({ id: 'd1', connectorId: 'conn-docs-1', contentHash: 'h1', status: 'embedded' }),
			buildDocument({ id: 'd2', connectorId: 'conn-docs-1', contentHash: 'h2', status: 'pending' }),
		]);
		const slackWorkspaces = new InMemorySlackWorkspaceRepository([buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-slack-1', teamName: 'Acme' })]);
		const slackChannels = new InMemorySlackChannelRepository([buildSlackChannel({ id: 'chan-1', workspaceId: 'ws-1', selected: true })]);
		const slackConversations = new InMemorySlackConversationRepository([buildSlackConversation({ workspaceId: 'ws-1', status: 'embedded' })]);

		const usecase = new ListConnectorsUseCase(connectors, repositories, documents, slackWorkspaces, slackChannels, slackConversations);
		const list = await usecase.execute('proj-1');

		expect(list).toHaveLength(3);

		const github = list.find((c) => c.type === 'github')!;
		expect(github.status).toBe('active'); // derived from repo.syncStatus === 'synced'
		expect(github.detail.remoteUrl).toBe('https://github.com/acme/payments-core');

		const docs = list.find((c) => c.type === 'documents')!;
		expect(docs.itemCount).toBe(2);
		expect(docs.embeddedCount).toBe(1);

		const slack = list.find((c) => c.type === 'slack')!;
		expect(slack.itemCount).toBe(1);
		expect(slack.detail.teamName).toBe('Acme');
		expect(slack.detail.selectedChannelCount).toBe(1);
	});
});
