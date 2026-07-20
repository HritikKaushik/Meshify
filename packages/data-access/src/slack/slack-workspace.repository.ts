import type { SlackWorkspace } from './slack-workspace.entity.js';

export interface CreateSlackWorkspaceInput {
	id: string;
	connectorId: string;
	projectId: string;
	integrationId?: string | null;
	teamId: string;
	teamName?: string | null;
	botUserId?: string | null;
	scope?: string | null;
	/** Legacy only — new attach-flow rows draw their token from the integration's vault instead. */
	encryptedAccessToken?: string | null;
}

export interface SlackWorkspaceRepository {
	create(input: CreateSlackWorkspaceInput): Promise<SlackWorkspace>;
	findById(id: string): Promise<SlackWorkspace | undefined>;
	findByConnectorId(connectorId: string): Promise<SlackWorkspace | undefined>;
	findByProjectAndTeam(projectId: string, teamId: string): Promise<SlackWorkspace | undefined>;
	listByProject(projectId: string): Promise<SlackWorkspace[]>;
	/** Every project workspace drawing on an org integration — webhook fan-out + disconnect list. */
	listByIntegrationId(integrationId: string): Promise<SlackWorkspace[]>;
	/** Refresh the encrypted access token (+ optional scope/bot user) on reconnect, so a rotated/revoked token is replaced. */
	updateAccessToken(id: string, encryptedAccessToken: string, meta?: { scope?: string | null; botUserId?: string | null }): Promise<void>;
	/** Delete a workspace row; channels/conversations/sync-state cascade. Usually the connector delete cascades here instead. */
	delete(id: string): Promise<void>;
}
