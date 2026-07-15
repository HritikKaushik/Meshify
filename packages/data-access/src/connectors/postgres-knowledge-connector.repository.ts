import type pg from 'pg';
import type { ConnectorStatus, ConnectorType, KnowledgeConnector } from './knowledge-connector.entity.js';
import type { CreateConnectorInput, KnowledgeConnectorRepository } from './knowledge-connector.repository.js';

interface ConnectorRow {
	id: string;
	project_id: string;
	type: string;
	display_name: string;
	status: string;
	config: Record<string, unknown>;
	last_error: string | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: ConnectorRow): KnowledgeConnector {
	return {
		id: row.id,
		projectId: row.project_id,
		type: row.type as ConnectorType,
		displayName: row.display_name,
		status: row.status as ConnectorStatus,
		config: row.config,
		lastError: row.last_error,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresKnowledgeConnectorRepository implements KnowledgeConnectorRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateConnectorInput): Promise<KnowledgeConnector> {
		const { rows } = await this.pool.query<ConnectorRow>(
			`insert into knowledge_connectors (id, project_id, type, display_name, status, config)
			 values ($1, $2, $3, $4, coalesce($5, 'connecting'), coalesce($6, '{}'::jsonb)) returning *`,
			[input.id, input.projectId, input.type, input.displayName, input.status ?? null, input.config ?? null]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into knowledge_connectors returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<KnowledgeConnector | undefined> {
		const { rows } = await this.pool.query<ConnectorRow>('select * from knowledge_connectors where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByProject(projectId: string): Promise<KnowledgeConnector[]> {
		const { rows } = await this.pool.query<ConnectorRow>('select * from knowledge_connectors where project_id = $1 order by created_at', [projectId]);
		return rows.map(toDomain);
	}

	async findByProjectAndType(projectId: string, type: ConnectorType): Promise<KnowledgeConnector | undefined> {
		const { rows } = await this.pool.query<ConnectorRow>('select * from knowledge_connectors where project_id = $1 and type = $2 order by created_at limit 1', [
			projectId,
			type,
		]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async updateStatus(id: string, status: ConnectorStatus, lastError?: string | null): Promise<void> {
		await this.pool.query('update knowledge_connectors set status = $2, last_error = $3, updated_at = now() where id = $1', [id, status, lastError ?? null]);
	}

	async updateConfig(id: string, config: Record<string, unknown>): Promise<void> {
		await this.pool.query('update knowledge_connectors set config = $2, updated_at = now() where id = $1', [id, config]);
	}

	async delete(id: string): Promise<void> {
		await this.pool.query('delete from knowledge_connectors where id = $1', [id]);
	}
}
