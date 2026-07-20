import type pg from 'pg';
import type { SyncCursor } from './sync-cursor.entity.js';
import type { SyncCursorRepository } from './sync-cursor.repository.js';

interface SyncCursorRow {
	id: string;
	connector_id: string;
	scope_key: string;
	cursor: Record<string, unknown>;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: SyncCursorRow): SyncCursor {
	return {
		id: row.id,
		connectorId: row.connector_id,
		scopeKey: row.scope_key,
		cursor: row.cursor,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresSyncCursorRepository implements SyncCursorRepository {
	constructor(private readonly pool: pg.Pool) {}

	async get(connectorId: string, scopeKey: string): Promise<SyncCursor | undefined> {
		const { rows } = await this.pool.query<SyncCursorRow>(
			'select * from sync_cursors where connector_id = $1 and scope_key = $2',
			[connectorId, scopeKey]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async upsert(connectorId: string, scopeKey: string, cursor: Record<string, unknown>): Promise<SyncCursor> {
		const { rows } = await this.pool.query<SyncCursorRow>(
			`insert into sync_cursors (connector_id, scope_key, cursor)
			 values ($1, $2, $3)
			 on conflict (connector_id, scope_key) do update
			 set cursor = excluded.cursor, updated_at = now()
			 returning *`,
			[connectorId, scopeKey, JSON.stringify(cursor)]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into sync_cursors returned no row');
		return toDomain(row);
	}

	async listByConnector(connectorId: string): Promise<SyncCursor[]> {
		const { rows } = await this.pool.query<SyncCursorRow>(
			'select * from sync_cursors where connector_id = $1 order by scope_key',
			[connectorId]
		);
		return rows.map(toDomain);
	}

	async deleteByConnector(connectorId: string): Promise<void> {
		await this.pool.query('delete from sync_cursors where connector_id = $1', [connectorId]);
	}
}
