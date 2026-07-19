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
/**
 * Provider id of the connector's source. Open-ended by design — ids are
 * validated by the application-side ProviderRegistry so a new provider needs no
 * schema/type change. Well-known values today: 'github', 'documents', 'slack'.
 */
export type ConnectorType = string;

export type ConnectorStatus = 'connecting' | 'active' | 'error' | 'disconnected';

/** How this connector's source is kept fresh. Interval scheduling is data-driven — no code change to enable later. */
export interface SyncPolicy {
	trigger: 'event' | 'manual' | 'interval';
	intervalMinutes?: number;
}

export interface KnowledgeConnector {
	id: string;
	projectId: string;
	type: ConnectorType;
	displayName: string;
	status: ConnectorStatus;
	/** Type-specific, non-sensitive settings (e.g. slack teamId). Secrets live in `integration_credentials`, encrypted. */
	config: Record<string, unknown>;
	/** The org-level Integration this connector draws credentials from. Null for credential-less sources (documents) and pre-platform rows. */
	integrationId: string | null;
	syncPolicy: SyncPolicy;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Connector types that are singletons per project (at most one row). `documents` is the uploaded-files source. */
export const SINGLETON_CONNECTOR_TYPES: ReadonlySet<ConnectorType> = new Set(['documents']);

const DEFAULT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
	github: 'GitHub repository',
	documents: 'Uploaded documents',
	slack: 'Slack workspace',
};

/**
 * Human-readable default label for a source type, used when a connector is
 * created without an explicit name. The ProviderRegistry's descriptor is the
 * authoritative display name; this is only the persistence-layer fallback.
 */
export function defaultConnectorDisplayName(type: ConnectorType): string {
	return DEFAULT_DISPLAY_NAMES[type] ?? (type.charAt(0).toUpperCase() + type.slice(1));
}
