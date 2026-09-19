import type { Queryable } from '../db/queryable.js';
import { LastOwnerError, type OrgMember, type OrgMembership, type OrgMembershipStatus, type OrgRoleKey } from './org-membership.entity.js';
import type { CreateOrgMembershipInput, OrgMembershipRepository } from './org-membership.repository.js';

interface OrgMembershipRow {
	id: string;
	org_id: string;
	user_id: string;
	role_key: OrgRoleKey;
	status: OrgMembershipStatus;
	clerk_membership_id: string | null;
	created_at: Date;
	updated_at: Date;
	removed_at: Date | null;
}

interface OrgMemberRow extends OrgMembershipRow {
	email: string | null;
	display_name: string | null;
	avatar_url: string | null;
	last_seen_at: Date | null;
}

const COLUMNS = 'id, org_id, user_id, role_key, status, clerk_membership_id, created_at, updated_at, removed_at';

function toDomain(row: OrgMembershipRow): OrgMembership {
	return {
		id: row.id,
		orgId: row.org_id,
		userId: row.user_id,
		roleKey: row.role_key,
		status: row.status,
		clerkMembershipId: row.clerk_membership_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		removedAt: row.removed_at,
	};
}

export class PostgresOrgMembershipRepository implements OrgMembershipRepository {
	constructor(private readonly pool: Queryable) {}

	async findByOrgAndUser(orgId: string, userId: string): Promise<OrgMembership | undefined> {
		const { rows } = await this.pool.query<OrgMembershipRow>(`select ${COLUMNS} from org_memberships where org_id = $1 and user_id = $2`, [orgId, userId]);
		return rows[0] ? toDomain(rows[0]) : undefined;
	}

	async listByOrg(orgId: string): Promise<OrgMember[]> {
		const { rows } = await this.pool.query<OrgMemberRow>(
			`select m.id, m.org_id, m.user_id, m.role_key, m.status, m.clerk_membership_id, m.created_at, m.updated_at, m.removed_at,
				u.email, u.display_name, u.avatar_url, u.last_seen_at
			 from org_memberships m
			 join users u on u.id = m.user_id
			 where m.org_id = $1 and m.status <> 'removed'
			 order by case m.role_key when 'owner' then 0 when 'admin' then 1 else 2 end, lower(coalesce(u.display_name, u.email, '')), m.created_at`,
			[orgId]
		);
		return rows.map((row) => ({ ...toDomain(row), email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url, lastSeenAt: row.last_seen_at }));
	}

	async hasActiveOwner(orgId: string): Promise<boolean> {
		const { rows } = await this.pool.query(`select 1 from org_memberships where org_id = $1 and role_key = 'owner' and status = 'active' limit 1`, [orgId]);
		return rows.length > 0;
	}

	async create(input: CreateOrgMembershipInput): Promise<OrgMembership> {
		const { rows } = await this.pool.query<OrgMembershipRow>(
			`insert into org_memberships (org_id, user_id, role_key, clerk_membership_id) values ($1, $2, $3, $4) returning ${COLUMNS}`,
			[input.orgId, input.userId, input.roleKey, input.clerkMembershipId ?? null]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into org_memberships returned no row');
		return toDomain(row);
	}

	async updateRole(orgId: string, userId: string, roleKey: OrgRoleKey): Promise<OrgMembership | undefined> {
		if (roleKey !== 'owner') await this.assertNotLastOwner(orgId, userId);
		const { rows } = await this.pool.query<OrgMembershipRow>(
			`update org_memberships set role_key = $3, updated_at = now() where org_id = $1 and user_id = $2 and status <> 'removed' returning ${COLUMNS}`,
			[orgId, userId, roleKey]
		);
		return rows[0] ? toDomain(rows[0]) : undefined;
	}

	async markRemoved(orgId: string, userId: string): Promise<boolean> {
		await this.assertNotLastOwner(orgId, userId);
		// Grants go with the membership: a returning member starts clean.
		await this.pool.query('delete from project_memberships where org_id = $1 and user_id = $2', [orgId, userId]);
		const { rowCount } = await this.pool.query(
			`update org_memberships set status = 'removed', removed_at = now(), updated_at = now() where org_id = $1 and user_id = $2 and status <> 'removed'`,
			[orgId, userId]
		);
		return (rowCount ?? 0) > 0;
	}

	async reactivate(orgId: string, userId: string, roleKey: OrgRoleKey): Promise<OrgMembership | undefined> {
		const { rows } = await this.pool.query<OrgMembershipRow>(
			`update org_memberships set status = 'active', role_key = $3, removed_at = null, updated_at = now()
			 where org_id = $1 and user_id = $2 and status = 'removed' returning ${COLUMNS}`,
			[orgId, userId, roleKey]
		);
		return rows[0] ? toDomain(rows[0]) : undefined;
	}

	async lockOrganization(orgId: string): Promise<boolean> {
		const { rows } = await this.pool.query('select 1 from organizations where id = $1 for update', [orgId]);
		return rows.length > 0;
	}

	/** Throws when `userId` is the only active owner of `orgId`. */
	private async assertNotLastOwner(orgId: string, userId: string): Promise<void> {
		const { rows } = await this.pool.query<{ user_id: string }>(`select user_id from org_memberships where org_id = $1 and role_key = 'owner' and status = 'active'`, [orgId]);
		if (rows.length === 1 && rows[0]?.user_id === userId) throw new LastOwnerError();
	}
}
