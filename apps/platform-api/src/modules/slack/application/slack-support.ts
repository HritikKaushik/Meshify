import type { KnowledgeConnector, KnowledgeConnectorRepository, SlackWorkspace, SlackWorkspaceRepository } from '@meshify/data-access';

export class SlackNotConfiguredError extends Error {
	constructor() {
		super('Slack is not configured on this deployment — set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_REDIRECT_URI');
		this.name = 'SlackNotConfiguredError';
	}
}

export class SlackConnectorNotFoundError extends Error {
	constructor(connectorId: string) {
		super(`Slack connector "${connectorId}" does not exist in this project`);
		this.name = 'SlackConnectorNotFoundError';
	}
}

/** Resolved Slack OAuth settings; presence is validated before any use case runs. */
export interface SlackRuntimeConfig {
	clientId?: string;
	clientSecret?: string;
	redirectUri?: string;
	/** HMAC secret for signing the OAuth `state` and AES key for the access token (ORG_KEY_ENCRYPTION_KEY). */
	secret?: string;
}

export function requireSlackConfig(config: SlackRuntimeConfig): Required<SlackRuntimeConfig> {
	if (!config.clientId || !config.clientSecret || !config.redirectUri || !config.secret) throw new SlackNotConfiguredError();
	return config as Required<SlackRuntimeConfig>;
}

/**
 * Loads the Slack connector + its workspace for a project, enforcing tenant
 * isolation (cross-project probing looks identical to a missing connector).
 */
export async function loadSlackWorkspace(
	connectors: KnowledgeConnectorRepository,
	workspaces: SlackWorkspaceRepository,
	projectId: string,
	connectorId: string
): Promise<{ connector: KnowledgeConnector; workspace: SlackWorkspace }> {
	const connector = await connectors.findById(connectorId);
	if (!connector || connector.projectId !== projectId || connector.type !== 'slack') throw new SlackConnectorNotFoundError(connectorId);
	const workspace = await workspaces.findByConnectorId(connectorId);
	if (!workspace) throw new SlackConnectorNotFoundError(connectorId);
	return { connector, workspace };
}
