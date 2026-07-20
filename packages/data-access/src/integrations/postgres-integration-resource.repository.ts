import type pg from 'pg';
import type { IntegrationResource } from './integration-resource.entity.js';
import type { IntegrationResourceRepository, UpsertIntegrationResourceInput } from './integration-resource.repository.js';

interface IntegrationResourceRow {
	id: string;
	integration_id: string;
	workspace_id: string | null;
	resource_id: string;
	kind: string;
	name: string;
	private: boolean;
	metadata: Record<string, unknown>;
	discovered_at: Date;
	updated_at: Date;
	removed_at: Date | null;
}

function toDomain(row: IntegrationResourceRow): IntegrationResource {
	return {
		id: row.id,
		integrationId: row.integration_id,
		workspaceId: row.workspace_id,
		resourceId: row.resource_id,
		kind: row.kind,
		name: row.name,
		private: row.private,
		metadata: row.metadata,
		discoveredAt: row.discovered_at,
		updatedAt: row.updated_at,
		removedAt: row.removed_at,
	};
}

export class PostgresIntegrationResourceRepository implements IntegrationResourceRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsertMany(resources: UpsertIntegrationResourceInput[]): Promise<void> {
		if (resources.length === 0) return;
		const values: unknown[] = [];
		const tuples = resources.map((r, i) => {
			const base = i * 7;
			values.push(r.integrationId, r.workspaceId ?? null, r.resourceId, r.kind, r.name, r.private ?? false, JSON.stringify(r.metadata ?? {}));
			return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
		});
		await this.pool.query(
			`insert into integration_resources (integration_id, workspace_id, resource_id, kind, name, private, metadata)
			 values ${tuples.join(', ')}
			 on conflict (integration_id, resource_id) do update
			 set workspace_id = excluded.workspace_id,
			     kind = excluded.kind,
			     name = excluded.name,
			     private = excluded.private,
			     metadata = excluded.metadata,
			     removed_at = null,
			     updated_at = now()`,
			values
		);
	}

	async listByIntegration(integrationId: string, opts?: { includeRemoved?: boolean }): Promise<IntegrationResource[]> {
		const { rows } = await this.pool.query<IntegrationResourceRow>(
			opts?.includeRemoved
				? 'select * from integration_resources where integration_id = $1 order by name'
				: 'select * from integration_resources where integration_id = $1 and removed_at is null order by name',
			[integrationId]
		);
		return rows.map(toDomain);
	}

	async findByResourceId(integrationId: string, resourceId: string): Promise<IntegrationResource | undefined> {
		const { rows } = await this.pool.query<IntegrationResourceRow>(
			'select * from integration_resources where integration_id = $1 and resource_id = $2',
			[integrationId, resourceId]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async markRemoved(integrationId: string, resourceIds: string[]): Promise<void> {
		if (resourceIds.length === 0) return;
		await this.pool.query(
			'update integration_resources set removed_at = now(), updated_at = now() where integration_id = $1 and resource_id = any($2)',
			[integrationId, resourceIds]
		);
	}

	async rename(integrationId: string, resourceId: string, name: string): Promise<void> {
		await this.pool.query(
			'update integration_resources set name = $3, updated_at = now() where integration_id = $1 and resource_id = $2',
			[integrationId, resourceId, name]
		);
	}

	async deleteAllForIntegration(integrationId: string): Promise<void> {
		await this.pool.query('delete from integration_resources where integration_id = $1', [integrationId]);
	}
}
