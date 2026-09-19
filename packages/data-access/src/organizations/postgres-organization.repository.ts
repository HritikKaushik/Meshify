import type { Queryable } from '../db/queryable.js';
import type { Organization } from './organization.entity.js';
import type { OrganizationRepository } from './organization.repository.js';

interface OrganizationRow {
	id: string;
	name: string;
	plan: string;
	created_at: Date;
}

export class PostgresOrganizationRepository implements OrganizationRepository {
	constructor(private readonly pool: Queryable) {}

	async findById(id: string): Promise<Organization | undefined> {
		const { rows } = await this.pool.query<OrganizationRow>('select id, name, plan, created_at from organizations where id = $1', [id]);
		const row = rows[0];
		return row ? { id: row.id, name: row.name, plan: row.plan, createdAt: row.created_at } : undefined;
	}
}
