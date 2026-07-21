import type pg from 'pg';
import type { ClerkOrgLink } from './clerk-org-link.entity.js';
import type { ClerkOrgLinkRepository, CreateClerkOrgLinkInput } from './clerk-org-link.repository.js';
import { decryptSecret, encryptSecret } from './secret-encryption.js';

interface ClerkOrgLinkRow {
	id: string;
	clerk_org_id: string;
	org_id: string;
	api_key_id: string;
	encrypted_secret: string;
	created_at: Date;
}

export class PostgresClerkOrgLinkRepository implements ClerkOrgLinkRepository {
	constructor(
		private readonly pool: pg.Pool,
		private readonly encryptionKey: string
	) {}

	private toDomain(row: ClerkOrgLinkRow): ClerkOrgLink {
		return {
			id: row.id,
			clerkOrgId: row.clerk_org_id,
			orgId: row.org_id,
			apiKeyId: row.api_key_id,
			// org_id is the v3 per-org context; ignored for older v2/v1 rows.
			apiKeyPlaintext: decryptSecret(this.encryptionKey, row.encrypted_secret, row.org_id),
			createdAt: row.created_at,
		};
	}

	async findByClerkOrgId(clerkOrgId: string): Promise<ClerkOrgLink | undefined> {
		const { rows } = await this.pool.query<ClerkOrgLinkRow>('select * from clerk_org_links where clerk_org_id = $1', [clerkOrgId]);
		const row = rows[0];
		return row ? this.toDomain(row) : undefined;
	}

	async create(input: CreateClerkOrgLinkInput): Promise<ClerkOrgLink> {
		// Bind the org's API key to its org (v3 per-org derived key).
		const encryptedSecret = encryptSecret(this.encryptionKey, input.apiKeyPlaintext, input.orgId);
		const { rows } = await this.pool.query<ClerkOrgLinkRow>(
			`insert into clerk_org_links (clerk_org_id, org_id, api_key_id, encrypted_secret)
			 values ($1, $2, $3, $4)
			 returning *`,
			[input.clerkOrgId, input.orgId, input.apiKeyId, encryptedSecret]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into clerk_org_links returned no row');
		return this.toDomain(row);
	}
}
