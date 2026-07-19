import type pg from 'pg';
import type { Integration, IntegrationHealth, IntegrationMode, IntegrationStatus } from './integration.entity.js';
import type { CreateIntegrationInput, IntegrationRepository } from './integration.repository.js';

interface IntegrationRow {
	id: string;
	org_id: string;
	provider: string;
	mode: IntegrationMode;
	external_account_id: string;
	external_account_name: string;
	status: IntegrationStatus;
	health: IntegrationHealth;
	health_detail: Record<string, unknown>;
	health_checked_at: Date | null;
	metadata: Record<string, unknown>;
	last_error: string | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: IntegrationRow): Integration {
	return {
		id: row.id,
		orgId: row.org_id,
		provider: row.provider,
		mode: row.mode,
		externalAccountId: row.external_account_id,
		externalAccountName: row.external_account_name,
		status: row.status,
		health: row.health,
		healthDetail: row.health_detail,
		healthCheckedAt: row.health_checked_at,
		metadata: row.metadata,
		lastError: row.last_error,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresIntegrationRepository implements IntegrationRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateIntegrationInput): Promise<Integration> {
		const { rows } = await this.pool.query<IntegrationRow>(
			`insert into integrations (id, org_id, provider, mode, external_account_id, external_account_name, status, metadata)
			 values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8) returning *`,
			[
				input.id ?? null,
				input.orgId,
				input.provider,
				input.mode ?? 'managed',
				input.externalAccountId,
				input.externalAccountName ?? '',
				input.status ?? 'pending',
				JSON.stringify(input.metadata ?? {}),
			]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into integrations returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<Integration | undefined> {
		const { rows } = await this.pool.query<IntegrationRow>('select * from integrations where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByIdForOrg(id: string, orgId: string): Promise<Integration | undefined> {
		const { rows } = await this.pool.query<IntegrationRow>('select * from integrations where id = $1 and org_id = $2', [id, orgId]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByOrgProviderAccount(orgId: string, provider: string, externalAccountId: string): Promise<Integration | undefined> {
		const { rows } = await this.pool.query<IntegrationRow>(
			'select * from integrations where org_id = $1 and provider = $2 and external_account_id = $3',
			[orgId, provider, externalAccountId]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByProviderAccount(provider: string, externalAccountId: string): Promise<Integration[]> {
		const { rows } = await this.pool.query<IntegrationRow>(
			'select * from integrations where provider = $1 and external_account_id = $2 order by created_at',
			[provider, externalAccountId]
		);
		return rows.map(toDomain);
	}

	async listByOrg(orgId: string): Promise<Integration[]> {
		const { rows } = await this.pool.query<IntegrationRow>('select * from integrations where org_id = $1 order by created_at', [orgId]);
		return rows.map(toDomain);
	}

	async listActiveByProvider(provider: string): Promise<Integration[]> {
		const { rows } = await this.pool.query<IntegrationRow>(
			`select * from integrations where provider = $1 and status = 'active' order by created_at`,
			[provider]
		);
		return rows.map(toDomain);
	}

	async updateStatus(id: string, status: IntegrationStatus, lastError?: string | null): Promise<void> {
		await this.pool.query(
			`update integrations set status = $2, last_error = $3, updated_at = now() where id = $1`,
			[id, status, lastError ?? null]
		);
	}

	async updateHealth(id: string, health: IntegrationHealth, detail?: Record<string, unknown>): Promise<void> {
		await this.pool.query(
			`update integrations
			 set health = $2,
			     health_detail = coalesce($3::jsonb, health_detail),
			     health_checked_at = now(),
			     updated_at = now()
			 where id = $1`,
			[id, health, detail ? JSON.stringify(detail) : null]
		);
	}

	async updateAccountInfo(id: string, input: { externalAccountName?: string; metadata?: Record<string, unknown> }): Promise<void> {
		await this.pool.query(
			`update integrations
			 set external_account_name = coalesce($2, external_account_name),
			     metadata = metadata || coalesce($3::jsonb, '{}'::jsonb),
			     updated_at = now()
			 where id = $1`,
			[id, input.externalAccountName ?? null, input.metadata ? JSON.stringify(input.metadata) : null]
		);
	}

	async delete(id: string): Promise<void> {
		await this.pool.query('delete from integrations where id = $1', [id]);
	}
}
