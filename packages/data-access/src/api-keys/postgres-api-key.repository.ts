import type pg from 'pg';
import type { ApiKey } from './api-key.entity.js';
import type { ActiveApiKey, ApiKeyRepository, CreateApiKeyInput } from './api-key.repository.js';

interface ApiKeyRow {
	id: string;
	org_id: string;
	name: string;
	key_prefix: string;
	scopes: string[];
	last_used_at: Date | null;
	expires_at: Date | null;
	revoked_at: Date | null;
	created_at: Date;
}

function toDomain(row: ApiKeyRow): ApiKey {
	return {
		id: row.id,
		orgId: row.org_id,
		name: row.name,
		keyPrefix: row.key_prefix,
		scopes: row.scopes,
		lastUsedAt: row.last_used_at,
		expiresAt: row.expires_at,
		revokedAt: row.revoked_at,
		createdAt: row.created_at,
	};
}

export class PostgresApiKeyRepository implements ApiKeyRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateApiKeyInput): Promise<ApiKey> {
		const { rows } = await this.pool.query<ApiKeyRow>(
			`insert into api_keys (org_id, name, key_prefix, key_hash, scopes, expires_at)
			 values ($1, $2, $3, $4, $5, $6)
			 returning id, org_id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at`,
			[input.orgId, input.name, input.keyPrefix, input.keyHash, input.scopes, input.expiresAt]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into api_keys returned no row');
		return toDomain(row);
	}

	async findByHash(keyHash: string): Promise<ActiveApiKey | undefined> {
		const { rows } = await this.pool.query<Pick<ApiKeyRow, 'id' | 'org_id' | 'scopes' | 'expires_at' | 'revoked_at'>>(
			'select id, org_id, scopes, expires_at, revoked_at from api_keys where key_hash = $1',
			[keyHash]
		);
		const row = rows[0];
		if (!row) return undefined;
		return { id: row.id, orgId: row.org_id, scopes: row.scopes, expiresAt: row.expires_at, revokedAt: row.revoked_at };
	}

	async touch(id: string): Promise<void> {
		await this.pool.query('update api_keys set last_used_at = now() where id = $1', [id]);
	}

	async revoke(id: string): Promise<boolean> {
		const { rowCount } = await this.pool.query('update api_keys set revoked_at = now() where id = $1 and revoked_at is null', [id]);
		return (rowCount ?? 0) > 0;
	}

	async listByOrg(orgId: string): Promise<ApiKey[]> {
		const { rows } = await this.pool.query<ApiKeyRow>(
			`select id, org_id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
			 from api_keys where org_id = $1 order by created_at desc`,
			[orgId]
		);
		return rows.map(toDomain);
	}
}
