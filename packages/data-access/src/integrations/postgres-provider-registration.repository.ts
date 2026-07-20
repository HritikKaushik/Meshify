import type pg from 'pg';
import type { ProviderRegistration } from './provider-registration.entity.js';
import type { ProviderRegistrationRepository } from './provider-registration.repository.js';

interface ProviderRegistrationRow {
	id: string;
	org_id: string;
	provider: string;
	mode: 'byoa';
	config: Record<string, unknown>;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: ProviderRegistrationRow): ProviderRegistration {
	return {
		id: row.id,
		orgId: row.org_id,
		provider: row.provider,
		mode: row.mode,
		config: row.config,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresProviderRegistrationRepository implements ProviderRegistrationRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: { orgId: string; provider: string; config: Record<string, unknown> }): Promise<ProviderRegistration> {
		const { rows } = await this.pool.query<ProviderRegistrationRow>(
			`insert into provider_registrations (org_id, provider, config)
			 values ($1, $2, $3)
			 on conflict (org_id, provider) do update
			 set config = provider_registrations.config || excluded.config, updated_at = now()
			 returning *`,
			[input.orgId, input.provider, JSON.stringify(input.config)]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into provider_registrations returned no row');
		return toDomain(row);
	}

	async findByOrgAndProvider(orgId: string, provider: string): Promise<ProviderRegistration | undefined> {
		const { rows } = await this.pool.query<ProviderRegistrationRow>('select * from provider_registrations where org_id = $1 and provider = $2', [orgId, provider]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findById(id: string): Promise<ProviderRegistration | undefined> {
		const { rows } = await this.pool.query<ProviderRegistrationRow>('select * from provider_registrations where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByOrg(orgId: string): Promise<ProviderRegistration[]> {
		const { rows } = await this.pool.query<ProviderRegistrationRow>('select * from provider_registrations where org_id = $1 order by provider', [orgId]);
		return rows.map(toDomain);
	}

	async delete(orgId: string, provider: string): Promise<void> {
		await this.pool.query('delete from provider_registrations where org_id = $1 and provider = $2', [orgId, provider]);
	}
}
