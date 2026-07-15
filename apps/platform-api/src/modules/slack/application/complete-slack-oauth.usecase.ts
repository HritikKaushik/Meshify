import { randomUUID } from 'node:crypto';
import { encryptSecret, type KnowledgeConnectorRepository, type SlackChannelRepository, type SlackWorkspaceRepository } from '@meshify/data-access';
import { exchangeCodeForToken, verifyState, type SlackClient, type SlackOAuthConfig, type SlackOAuthResult } from '@meshify/slack';
import { requireSlackConfig, type SlackRuntimeConfig } from './slack-support.js';

/** The oauth.v2.access exchange, injectable so the use case is unit-testable without network. */
export type SlackOAuthExchange = (config: SlackOAuthConfig, code: string) => Promise<SlackOAuthResult>;

export interface CompleteSlackOAuthCommand {
	projectId: string;
	code: string;
	state: string;
}

export interface CompleteSlackOAuthResult {
	connectorId: string;
	workspaceId: string;
	teamName: string | null;
	channelCount: number;
}

/**
 * Finishes the Slack OAuth flow (called by the same-origin, Clerk-gated web
 * callback route): verifies the signed `state`, exchanges the code for a bot
 * token server-side, persists a `slack` connector + workspace (token encrypted
 * at rest), and discovers the workspace's channels for the picker.
 */
export class CompleteSlackOAuthUseCase {
	constructor(
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly workspaces: SlackWorkspaceRepository,
		private readonly channels: SlackChannelRepository,
		private readonly slack: SlackClient,
		private readonly config: SlackRuntimeConfig,
		private readonly now: () => number = () => Date.now(),
		private readonly exchange: SlackOAuthExchange = exchangeCodeForToken
	) {}

	async execute(command: CompleteSlackOAuthCommand): Promise<CompleteSlackOAuthResult> {
		const config = requireSlackConfig(this.config);

		const state = verifyState(command.state, config.secret, this.now());
		// The signed state binds the flow to a project; a mismatch means a forged/replayed callback.
		if (state.projectId !== command.projectId) throw new Error('OAuth state does not match this project');

		const oauth = await this.exchange({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri }, command.code);

		// Reconnecting the same team reuses its connector/workspace rather than duplicating it.
		let connectorId: string;
		let workspaceId: string;
		const existing = await this.workspaces.findByProjectAndTeam(command.projectId, oauth.teamId);
		if (existing) {
			connectorId = existing.connectorId;
			workspaceId = existing.id;
			// Persist the freshly-issued token (reconnect exists precisely to replace a rotated/revoked one);
			// only flipping status would leave every future sync decrypting the stale token.
			await this.workspaces.updateAccessToken(existing.id, encryptSecret(config.secret, oauth.accessToken), { scope: oauth.scope, botUserId: oauth.botUserId });
			await this.connectors.updateStatus(connectorId, 'active', null);
		} else {
			const connector = await this.connectors.create({
				id: randomUUID(),
				projectId: command.projectId,
				type: 'slack',
				displayName: oauth.teamName ?? 'Slack workspace',
				status: 'active',
				config: { teamId: oauth.teamId },
			});
			const workspace = await this.workspaces.create({
				id: randomUUID(),
				connectorId: connector.id,
				projectId: command.projectId,
				teamId: oauth.teamId,
				teamName: oauth.teamName,
				botUserId: oauth.botUserId,
				scope: oauth.scope,
				encryptedAccessToken: encryptSecret(config.secret, oauth.accessToken),
			});
			connectorId = connector.id;
			workspaceId = workspace.id;
		}

		// Discover channels the bot can see so the user can pick which to ingest.
		const discovered = await this.slack.listChannels(oauth.accessToken);
		for (const channel of discovered) {
			await this.channels.upsert({
				id: randomUUID(),
				workspaceId,
				projectId: command.projectId,
				channelId: channel.id,
				name: channel.name,
				isPrivate: channel.isPrivate,
			});
		}

		return { connectorId, workspaceId, teamName: oauth.teamName, channelCount: discovered.length };
	}
}
