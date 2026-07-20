import type pg from 'pg';
import type { OAuthState } from './oauth-state.entity.js';
import type { CreateOAuthStateInput, OAuthStateRepository } from './oauth-state.repository.js';

interface OAuthStateRow {
	id: string;
	state_hash: string;
	org_id: string;
	provider: string;
	project_id: string | null;
	intent: 'connect' | 'reconnect';
	integration_id: string | null;
	return_path: string | null;
	created_by_key_id: string | null;
	expires_at: Date;
	consumed_at: Date | null;
	created_at: Date;
}

function toDomain(row: OAuthStateRow): OAuthState {
	return {
		id: row.id,
		stateHash: row.state_hash,
		orgId: row.org_id,
		provider: row.provider,
		projectId: row.project_id,
		intent: row.intent,
		integrationId: row.integration_id,
		returnPath: row.return_path,
		createdByKeyId: row.created_by_key_id,
		expiresAt: row.expires_at,
		consumedAt: row.consumed_at,
		createdAt: row.created_at,
	};
}

export class PostgresOAuthStateRepository implements OAuthStateRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateOAuthStateInput): Promise<OAuthState> {
		const { rows } = await this.pool.query<OAuthStateRow>(
			`insert into oauth_states (state_hash, org_id, provider, project_id, intent, integration_id, return_path, created_by_key_id, expires_at)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
			[
				input.stateHash,
				input.orgId,
				input.provider,
				input.projectId ?? null,
				input.intent ?? 'connect',
				input.integrationId ?? null,
				input.returnPath ?? null,
				input.createdByKeyId ?? null,
				input.expiresAt,
			]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into oauth_states returned no row');
		return toDomain(row);
	}

	async consumeByHash(stateHash: string, now: Date): Promise<OAuthState | undefined> {
		const { rows } = await this.pool.query<OAuthStateRow>(
			`update oauth_states
			 set consumed_at = now()
			 where state_hash = $1 and consumed_at is null and expires_at > $2
			 returning *`,
			[stateHash, now]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async deleteExpiredBefore(before: Date): Promise<number> {
		const result = await this.pool.query('delete from oauth_states where expires_at < $1', [before]);
		return result.rowCount ?? 0;
	}
}
