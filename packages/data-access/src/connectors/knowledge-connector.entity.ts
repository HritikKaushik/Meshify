/**
 * The generic Connector aggregate. Every knowledge source a project connects —
 * GitHub repositories, uploaded Documents, Slack workspaces, and future sources
 * (Confluence, Jira, Notion, Teams, Google Drive) — is modeled as a
 * KnowledgeConnector row. Type-specific detail lives in the per-source tables
 * (`repositories`, `documents`, `slack_*`) linked back by `connector_id`.
 *
 * Grain: one `github` connector per repository, one singleton `documents`
 * connector per project (owns all uploaded docs), one `slack` connector per
 * workspace (owns its channels + conversations).
 */
export type ConnectorType = 'github' | 'documents' | 'slack';

export type ConnectorStatus = 'connecting' | 'active' | 'error' | 'disconnected';

export interface KnowledgeConnector {
	id: string;
	projectId: string;
	type: ConnectorType;
	displayName: string;
	status: ConnectorStatus;
	/** Type-specific, non-sensitive settings (e.g. slack teamId). Secrets live in the detail tables, encrypted. */
	config: Record<string, unknown>;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Connector types that are singletons per project (at most one row). `documents` is the uploaded-files source. */
export const SINGLETON_CONNECTOR_TYPES: ReadonlySet<ConnectorType> = new Set(['documents']);

/** Human-readable default label for a source type, used when a connector is created without an explicit name. */
export function defaultConnectorDisplayName(type: ConnectorType): string {
	switch (type) {
		case 'github':
			return 'GitHub repository';
		case 'documents':
			return 'Uploaded documents';
		case 'slack':
			return 'Slack workspace';
	}
}
