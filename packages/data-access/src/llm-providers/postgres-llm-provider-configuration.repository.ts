import type pg from 'pg';
import type { LLMProviderConfiguration, LlmProviderStatus } from './llm-provider-configuration.entity.js';
import type { LlmProviderConfigurationRepository, UpsertLlmProviderConfigurationInput } from './llm-provider-configuration.repository.js';

interface LlmProviderConfigurationRow {
	id: string;
	org_id: string;
	provider: string;
	status: LlmProviderStatus;
	default_model: string | null;
	config: Record<string, unknown>;
	metadata: Record<string, unknown>;
	last_error: string | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: LlmProviderConfigurationRow): LLMProviderConfiguration {
	return {
		id: row.id,
		orgId: row.org_id,
		provider: row.provider,
		status: row.status,
		defaultModel: row.default_model,
		config: row.config,
		metadata: row.metadata,
		lastError: row.last_error,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresLlmProviderConfigurationRepository implements LlmProviderConfigurationRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: UpsertLlmProviderConfigurationInput): Promise<LLMProviderConfiguration> {
		const { rows } = await this.pool.query<LlmProviderConfigurationRow>(
			`insert into llm_provider_configurations (org_id, provider, status, default_model, config)
			 values ($1, $2, coalesce($3, 'disconnected'), $4, $5)
			 on conflict (org_id, provider) do update
			 set status = coalesce($3, llm_provider_configurations.status),
			     default_model = coalesce($4, llm_provider_configurations.default_model),
			     config = llm_provider_configurations.config || excluded.config,
			     updated_at = now()
			 returning *`,
			[input.orgId, input.provider, input.status ?? null, input.defaultModel ?? null, JSON.stringify(input.config ?? {})]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into llm_provider_configurations returned no row');
		return toDomain(row);
	}

	async findByOrgAndProvider(orgId: string, provider: string): Promise<LLMProviderConfiguration | undefined> {
		const { rows } = await this.pool.query<LlmProviderConfigurationRow>(
			'select * from llm_provider_configurations where org_id = $1 and provider = $2',
			[orgId, provider]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByIdForOrg(id: string, orgId: string): Promise<LLMProviderConfiguration | undefined> {
		const { rows } = await this.pool.query<LlmProviderConfigurationRow>(
			'select * from llm_provider_configurations where id = $1 and org_id = $2',
			[id, orgId]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findActiveByOrg(orgId: string): Promise<LLMProviderConfiguration | undefined> {
		const { rows } = await this.pool.query<LlmProviderConfigurationRow>(
			`select c.* from llm_provider_configurations c
			 join active_llm_providers a on a.configuration_id = c.id
			 where a.org_id = $1`,
			[orgId]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByOrg(orgId: string): Promise<LLMProviderConfiguration[]> {
		const { rows } = await this.pool.query<LlmProviderConfigurationRow>(
			'select * from llm_provider_configurations where org_id = $1 order by provider',
			[orgId]
		);
		return rows.map(toDomain);
	}

	async updateStatus(id: string, status: LlmProviderStatus, lastError?: string | null): Promise<void> {
		await this.pool.query('update llm_provider_configurations set status = $2, last_error = $3, updated_at = now() where id = $1', [
			id,
			status,
			lastError ?? null,
		]);
	}

	async updateDefaultModel(id: string, defaultModel: string | null): Promise<void> {
		await this.pool.query('update llm_provider_configurations set default_model = $2, updated_at = now() where id = $1', [id, defaultModel]);
	}

	async delete(orgId: string, provider: string): Promise<void> {
		await this.pool.query('delete from llm_provider_configurations where org_id = $1 and provider = $2', [orgId, provider]);
	}
}
