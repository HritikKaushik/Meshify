import type pg from 'pg';
import type { ActiveLLMProvider } from './active-llm-provider.entity.js';
import type { ActiveLlmProviderRepository } from './active-llm-provider.repository.js';

interface ActiveLlmProviderRow {
	org_id: string;
	configuration_id: string;
	updated_at: Date;
}

function toDomain(row: ActiveLlmProviderRow): ActiveLLMProvider {
	return { orgId: row.org_id, configurationId: row.configuration_id, updatedAt: row.updated_at };
}

export class PostgresActiveLlmProviderRepository implements ActiveLlmProviderRepository {
	constructor(private readonly pool: pg.Pool) {}

	async setActive(orgId: string, configurationId: string): Promise<void> {
		await this.pool.query(
			`insert into active_llm_providers (org_id, configuration_id)
			 values ($1, $2)
			 on conflict (org_id) do update
			 set configuration_id = excluded.configuration_id, updated_at = now()`,
			[orgId, configurationId]
		);
	}

	async findByOrg(orgId: string): Promise<ActiveLLMProvider | undefined> {
		const { rows } = await this.pool.query<ActiveLlmProviderRow>('select * from active_llm_providers where org_id = $1', [orgId]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async clear(orgId: string): Promise<void> {
		await this.pool.query('delete from active_llm_providers where org_id = $1', [orgId]);
	}
}
