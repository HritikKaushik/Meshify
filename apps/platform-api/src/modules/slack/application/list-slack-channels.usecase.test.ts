import { describe, expect, it } from 'vitest';
import {
	InMemoryKnowledgeConnectorRepository,
	InMemorySlackChannelRepository,
	InMemorySlackWorkspaceRepository,
	buildKnowledgeConnector,
	buildSlackChannel,
	buildSlackWorkspace,
} from '@meshify/testing';
import { ListSlackChannelsUseCase } from './list-slack-channels.usecase.js';
import { SlackConnectorNotFoundError } from './slack-support.js';

function makeUseCase() {
	const connectors = new InMemoryKnowledgeConnectorRepository([buildKnowledgeConnector({ id: 'conn-1', type: 'slack' }), buildKnowledgeConnector({ id: 'conn-gh', type: 'github' })]);
	const workspaces = new InMemorySlackWorkspaceRepository([buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-1' })]);
	const channels = new InMemorySlackChannelRepository([buildSlackChannel({ id: 'ch-1', workspaceId: 'ws-1', channelId: 'C1' })]);
	return new ListSlackChannelsUseCase(connectors, workspaces, channels);
}

describe('ListSlackChannelsUseCase', () => {
	it('returns the workspace channels for a valid slack connector', async () => {
		const channels = await makeUseCase().execute({ projectId: 'proj-1', connectorId: 'conn-1' });
		expect(channels.map((c) => c.channelId)).toEqual(['C1']);
	});

	it('rejects a cross-project connector (tenant isolation)', async () => {
		await expect(makeUseCase().execute({ projectId: 'other-project', connectorId: 'conn-1' })).rejects.toBeInstanceOf(SlackConnectorNotFoundError);
	});

	it('rejects a non-slack connector id', async () => {
		await expect(makeUseCase().execute({ projectId: 'proj-1', connectorId: 'conn-gh' })).rejects.toBeInstanceOf(SlackConnectorNotFoundError);
	});
});
