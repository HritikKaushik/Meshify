import type { ConnectorStatus, ConnectorType, KnowledgeConnector, SyncPolicy } from './knowledge-connector.entity.js';

export interface CreateConnectorInput {
	id: string;
	projectId: string;
	type: ConnectorType;
	displayName: string;
	status?: ConnectorStatus;
	config?: Record<string, unknown>;
	integrationId?: string;
	syncPolicy?: SyncPolicy;
}

export interface KnowledgeConnectorRepository {
	create(input: CreateConnectorInput): Promise<KnowledgeConnector>;
	findById(id: string): Promise<KnowledgeConnector | undefined>;
	listByProject(projectId: string): Promise<KnowledgeConnector[]>;
	/** At-most-one lookup for singleton source types (e.g. the project's `documents` connector). */
	findByProjectAndType(projectId: string, type: ConnectorType): Promise<KnowledgeConnector | undefined>;
	/** Every project connector drawing on an org integration — the disconnect fan-out list. */
	listByIntegration(integrationId: string): Promise<KnowledgeConnector[]>;
	/** Bind a pre-platform connector to an org integration (the "upgrade to managed" path). */
	setIntegration(id: string, integrationId: string | null): Promise<void>;
	updateStatus(id: string, status: ConnectorStatus, lastError?: string | null): Promise<void>;
	updateConfig(id: string, config: Record<string, unknown>): Promise<void>;
	/** Delete a connector row; detail rows (`repositories`/`documents`/`slack_*`) cascade via their `connector_id` FK. */
	delete(id: string): Promise<void>;
}
