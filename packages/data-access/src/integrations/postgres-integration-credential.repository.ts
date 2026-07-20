import type pg from 'pg';
import type { IntegrationCredential } from './integration-credential.entity.js';
import type { IntegrationCredentialRepository, UpsertIntegrationCredentialInput } from './integration-credential.repository.js';

interface IntegrationCredentialRow {
	id: string;
	integration_id: string;
	kind: string;
	encrypted_value: string;
	expires_at: Date | null;
	rotated_at: Date | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: IntegrationCredentialRow): IntegrationCredential {
	return {
		id: row.id,
		integrationId: row.integration_id,
		kind: row.kind,
		encryptedValue: row.encrypted_value,
		expiresAt: row.expires_at,
		rotatedAt: row.rotated_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresIntegrationCredentialRepository implements IntegrationCredentialRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: UpsertIntegrationCredentialInput): Promise<IntegrationCredential> {
		const { rows } = await this.pool.query<IntegrationCredentialRow>(
			`insert into integration_credentials (integration_id, kind, encrypted_value, expires_at)
			 values ($1, $2, $3, $4)
			 on conflict (integration_id, kind) do update
			 set encrypted_value = excluded.encrypted_value,
			     expires_at = excluded.expires_at,
			     rotated_at = now(),
			     updated_at = now()
			 returning *`,
			[input.integrationId, input.kind, input.encryptedValue, input.expiresAt ?? null]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into integration_credentials returned no row');
		return toDomain(row);
	}

	async findByIntegrationAndKind(integrationId: string, kind: string): Promise<IntegrationCredential | undefined> {
		const { rows } = await this.pool.query<IntegrationCredentialRow>(
			'select * from integration_credentials where integration_id = $1 and kind = $2',
			[integrationId, kind]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByIntegration(integrationId: string): Promise<IntegrationCredential[]> {
		const { rows } = await this.pool.query<IntegrationCredentialRow>(
			'select * from integration_credentials where integration_id = $1 order by kind',
			[integrationId]
		);
		return rows.map(toDomain);
	}

	async listExpiringBefore(before: Date): Promise<IntegrationCredential[]> {
		const { rows } = await this.pool.query<IntegrationCredentialRow>(
			'select * from integration_credentials where expires_at is not null and expires_at < $1 order by expires_at',
			[before]
		);
		return rows.map(toDomain);
	}

	async delete(integrationId: string, kind: string): Promise<void> {
		await this.pool.query('delete from integration_credentials where integration_id = $1 and kind = $2', [integrationId, kind]);
	}

	async deleteAllForIntegration(integrationId: string): Promise<void> {
		await this.pool.query('delete from integration_credentials where integration_id = $1', [integrationId]);
	}
}
