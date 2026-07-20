import { randomUUID } from 'node:crypto';
import type { IntegrationRepository, KnowledgeConnectorRepository, SlackChannelRepository, SlackWorkspaceRepository } from '@meshify/data-access';
import type { CredentialVault } from '@meshify/providers';
import type { SlackClient } from '@meshify/slack';

export interface AttachSlackWorkspaceCommand {
	projectId: string;
	orgId: string;
	integrationId: string;
}

export interface AttachSlackWorkspaceResult {
	connectorId: string;
	workspaceId: string;
	teamName: string | null;
	channelCount: number;
	alreadyAttached: boolean;
}

/** Unknown id, wrong provider, and cross-org probe are indistinguishable (404). */
export class SlackIntegrationNotFoundError extends Error {
	constructor() {
		super('Slack integration not found');
		this.name = 'SlackIntegrationNotFoundError';
	}
}

export class SlackIntegrationNotUsableError extends Error {
	constructor(reason: string) {
		super(`This Slack integration cannot be used: ${reason}`);
		this.name = 'SlackIntegrationNotUsableError';
	}
}

/**
 * Attach an org-level Slack integration to a project: no second OAuth — the
 * workspace was authorized once at org level, and projects simply bind it
 * (connector + token-less workspace row) and pick channels. This is the
 * provider-platform successor to the per-project OAuth flow.
 */
export class AttachSlackWorkspaceUseCase {
	constructor(
		private readonly integrations: IntegrationRepository,
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly workspaces: SlackWorkspaceRepository,
		private readonly channels: SlackChannelRepository,
		private readonly vault: CredentialVault,
		private readonly slack: Pick<SlackClient, 'listChannels'>
	) {}

	async execute(command: AttachSlackWorkspaceCommand): Promise<AttachSlackWorkspaceResult> {
		const integration = await this.integrations.findByIdForOrg(command.integrationId, command.orgId);
		if (!integration || integration.provider !== 'slack') throw new SlackIntegrationNotFoundError();
		if (integration.status !== 'active') throw new SlackIntegrationNotUsableError(`it is ${integration.status} — reconnect it first`);

		const existing = await this.workspaces.findByProjectAndTeam(command.projectId, integration.externalAccountId);
		if (existing) {
			const channels = await this.channels.listByWorkspace(existing.id);
			return {
				connectorId: existing.connectorId,
				workspaceId: existing.id,
				teamName: existing.teamName,
				channelCount: channels.length,
				alreadyAttached: true,
			};
		}

		const token = await this.vault.get(integration.id, 'access_token');
		if (!token) throw new SlackIntegrationNotUsableError('its token is missing or expired — reconnect it first');

		const connector = await this.connectors.create({
			id: randomUUID(),
			projectId: command.projectId,
			type: 'slack',
			displayName: integration.externalAccountName,
			status: 'active',
			config: { teamId: integration.externalAccountId, integrationId: integration.id },
			integrationId: integration.id,
		});

		const workspace = await this.workspaces.create({
			id: randomUUID(),
			connectorId: connector.id,
			projectId: command.projectId,
			integrationId: integration.id,
			teamId: integration.externalAccountId,
			teamName: integration.externalAccountName,
			botUserId: typeof integration.metadata.botUserId === 'string' ? integration.metadata.botUserId : null,
			scope: typeof integration.metadata.scope === 'string' ? integration.metadata.scope : null,
		});

		const discovered = await this.slack.listChannels(token.value);
		for (const channel of discovered) {
			await this.channels.upsert({
				id: randomUUID(),
				workspaceId: workspace.id,
				projectId: command.projectId,
				channelId: channel.id,
				name: channel.name,
				isPrivate: channel.isPrivate,
			});
		}

		return {
			connectorId: connector.id,
			workspaceId: workspace.id,
			teamName: workspace.teamName,
			channelCount: discovered.length,
			alreadyAttached: false,
		};
	}
}
