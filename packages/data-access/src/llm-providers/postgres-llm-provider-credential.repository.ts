import type pg from 'pg';

/**
 * Encrypted secret storage for LLM provider configurations. Structurally
 * satisfies the providers package's CredentialStore port (keyed by
 * `integrationId`, which here carries the configuration id), so the same
 * CredentialVault + cipher used by the Integrations platform stores LLM API
 * keys — no duplicate crypto, no secrets in the metadata tables.
 */
interface LlmProviderCredentialRow {
	encrypted_value: string;
	expires_at: Date | null;
}

export class PostgresLlmProviderCredentialRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: { integrationId: string; kind: string; encryptedValue: string; expiresAt?: Date | null }): Promise<void> {
		await this.pool.query(
			`insert into llm_provider_credentials (configuration_id, kind, encrypted_value)
			 values ($1, $2, $3)
			 on conflict (configuration_id, kind) do update
			 set encrypted_value = excluded.encrypted_value, updated_at = now()`,
			[input.integrationId, input.kind, input.encryptedValue]
		);
	}

	async findByIntegrationAndKind(integrationId: string, kind: string): Promise<{ encryptedValue: string; expiresAt: Date | null } | undefined> {
		const { rows } = await this.pool.query<LlmProviderCredentialRow>(
			'select encrypted_value, null::timestamptz as expires_at from llm_provider_credentials where configuration_id = $1 and kind = $2',
			[integrationId, kind]
		);
		const row = rows[0];
		return row ? { encryptedValue: row.encrypted_value, expiresAt: row.expires_at } : undefined;
	}

	async delete(integrationId: string, kind: string): Promise<void> {
		await this.pool.query('delete from llm_provider_credentials where configuration_id = $1 and kind = $2', [integrationId, kind]);
	}

	async deleteAllForIntegration(integrationId: string): Promise<void> {
		await this.pool.query('delete from llm_provider_credentials where configuration_id = $1', [integrationId]);
	}
}
