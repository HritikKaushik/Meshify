import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@meshify/data-access';
import { FakeSlackClient, signState } from '@meshify/slack';
import { InMemoryKnowledgeConnectorRepository, InMemorySlackChannelRepository, InMemorySlackWorkspaceRepository, buildKnowledgeConnector, buildSlackWorkspace } from '@meshify/testing';
import { CompleteSlackOAuthUseCase } from './complete-slack-oauth.usecase.js';
import { SlackNotConfiguredError } from './slack-support.js';

const KEY = 'an-org-key-encryption-secret-32chars!!';
const CONFIG = { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'https://app.example.com/oauth/slack/callback', secret: KEY };
const NOW = 1_000_000;

const fakeExchange = async () => ({ accessToken: 'xoxb-real', teamId: 'T1', teamName: 'Acme', botUserId: 'B1', scope: 'channels:history' });

function makeUseCase(slack: FakeSlackClient) {
	const connectors = new InMemoryKnowledgeConnectorRepository();
	const workspaces = new InMemorySlackWorkspaceRepository();
	const channels = new InMemorySlackChannelRepository();
	const usecase = new CompleteSlackOAuthUseCase(connectors, workspaces, channels, slack, CONFIG, () => NOW, fakeExchange);
	return { usecase, connectors, workspaces, channels };
}

describe('CompleteSlackOAuthUseCase', () => {
	it('exchanges the code, creates a slack connector + encrypted workspace, and discovers channels', async () => {
		const slack = new FakeSlackClient({ channels: [{ id: 'C1', name: 'general', isPrivate: false }, { id: 'C2', name: 'random', isPrivate: false }] });
		const { usecase, connectors, workspaces, channels } = makeUseCase(slack);
		const state = signState({ projectId: 'proj-1' }, KEY, NOW);

		const result = await usecase.execute({ projectId: 'proj-1', code: 'auth-code', state });

		expect(result.channelCount).toBe(2);
		const connector = await connectors.findById(result.connectorId);
		expect(connector?.type).toBe('slack');
		expect(connector?.status).toBe('active');

		const workspace = await workspaces.findByConnectorId(result.connectorId);
		expect(workspace?.teamId).toBe('T1');
		// Token stored encrypted, recoverable with the key.
		expect(decryptSecret(KEY, workspace!.encryptedAccessToken)).toBe('xoxb-real');

		const discovered = await channels.listByWorkspace(result.workspaceId);
		expect(discovered.map((c) => c.channelId).sort()).toEqual(['C1', 'C2']);
	});

	it('reconnect: reuses the existing connector/workspace but PERSISTS the freshly issued token (not just status)', async () => {
		const connectors = new InMemoryKnowledgeConnectorRepository([buildKnowledgeConnector({ id: 'conn-1', type: 'slack', status: 'error' })]);
		const workspaces = new InMemorySlackWorkspaceRepository([
			buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-1', projectId: 'proj-1', teamId: 'T1', encryptedAccessToken: encryptSecret(KEY, 'xoxb-STALE-revoked') }),
		]);
		const channels = new InMemorySlackChannelRepository();
		const slack = new FakeSlackClient({ channels: [{ id: 'C1', name: 'general', isPrivate: false }] });
		const usecase = new CompleteSlackOAuthUseCase(connectors, workspaces, channels, slack, CONFIG, () => NOW, fakeExchange);

		const result = await usecase.execute({ projectId: 'proj-1', code: 'auth-code', state: signState({ projectId: 'proj-1' }, KEY, NOW) });

		expect(result.connectorId).toBe('conn-1'); // reused, not duplicated
		expect(await workspaces.listByProject('proj-1')).toHaveLength(1);
		const ws = await workspaces.findByConnectorId('conn-1');
		// The revoked token must be REPLACED by the fresh one so subsequent syncs work.
		expect(decryptSecret(KEY, ws!.encryptedAccessToken)).toBe('xoxb-real');
		expect(await connectors.findById('conn-1').then((c) => c?.status)).toBe('active');
	});

	it('rejects a state signed for a different project', async () => {
		const { usecase } = makeUseCase(new FakeSlackClient());
		const state = signState({ projectId: 'other-project' }, KEY, NOW);
		await expect(usecase.execute({ projectId: 'proj-1', code: 'c', state })).rejects.toThrow(/does not match/);
	});

	it('throws SlackNotConfiguredError when credentials are absent', async () => {
		const usecase = new CompleteSlackOAuthUseCase(
			new InMemoryKnowledgeConnectorRepository(),
			new InMemorySlackWorkspaceRepository(),
			new InMemorySlackChannelRepository(),
			new FakeSlackClient(),
			{ clientId: undefined, clientSecret: undefined, redirectUri: undefined, secret: undefined },
			() => NOW,
			fakeExchange
		);
		await expect(usecase.execute({ projectId: 'proj-1', code: 'c', state: 'x' })).rejects.toBeInstanceOf(SlackNotConfiguredError);
	});
});
