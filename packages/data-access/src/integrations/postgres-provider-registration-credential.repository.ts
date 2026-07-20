import type pg from 'pg';

/**
 * App-level secret storage for provider registrations. Structurally satisfies
 * the providers package's CredentialStore port (keyed by `integrationId`,
 * which here carries the registration id), so the same CredentialVault serves
 * both registration app-credentials and integration runtime-credentials.
 */
interface RegistrationCredentialRow {
	encrypted_value: string;
	expires_at: Date | null;
}

export class PostgresProviderRegistrationCredentialRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: { integrationId: string; kind: string; encryptedValue: string; expiresAt?: Date | null }): Promise<void> {
		await this.pool.query(
			`insert into provider_registration_credentials (registration_id, kind, encrypted_value)
			 values ($1, $2, $3)
			 on conflict (registration_id, kind) do update
			 set encrypted_value = excluded.encrypted_value, updated_at = now()`,
			[input.integrationId, input.kind, input.encryptedValue]
		);
	}

	async findByIntegrationAndKind(integrationId: string, kind: string): Promise<{ encryptedValue: string; expiresAt: Date | null } | undefined> {
		const { rows } = await this.pool.query<RegistrationCredentialRow>(
			'select encrypted_value, null::timestamptz as expires_at from provider_registration_credentials where registration_id = $1 and kind = $2',
			[integrationId, kind]
		);
		const row = rows[0];
		return row ? { encryptedValue: row.encrypted_value, expiresAt: row.expires_at } : undefined;
	}

	async delete(integrationId: string, kind: string): Promise<void> {
		await this.pool.query('delete from provider_registration_credentials where registration_id = $1 and kind = $2', [integrationId, kind]);
	}

	async deleteAllForIntegration(integrationId: string): Promise<void> {
		await this.pool.query('delete from provider_registration_credentials where registration_id = $1', [integrationId]);
	}
}
