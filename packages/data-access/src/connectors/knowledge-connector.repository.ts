import type { ConnectorStatus, ConnectorType, KnowledgeConnector } from './knowledge-connector.entity.js';

export interface CreateConnectorInput {
	id: string;
	projectId: string;
	type: ConnectorType;
	displayName: string;
	status?: ConnectorStatus;
	config?: Record<string, unknown>;
}

export interface KnowledgeConnectorRepository {
	create(input: CreateConnectorInput): Promise<KnowledgeConnector>;
	findById(id: string): Promise<KnowledgeConnector | undefined>;
	listByProject(projectId: string): Promise<KnowledgeConnector[]>;
	/** At-most-one lookup for singleton source types (e.g. the project's `documents` connector). */
	findByProjectAndType(projectId: string, type: ConnectorType): Promise<KnowledgeConnector | undefined>;
	updateStatus(id: string, status: ConnectorStatus, lastError?: string | null): Promise<void>;
	updateConfig(id: string, config: Record<string, unknown>): Promise<void>;
	/** Delete a connector row; detail rows (`repositories`/`documents`/`slack_*`) cascade via their `connector_id` FK. */
	delete(id: string): Promise<void>;
}
