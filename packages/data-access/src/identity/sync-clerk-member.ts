import type pg from 'pg';
import { withTransaction } from '../db/transaction.js';
import type { OrgMembershipStatus, OrgRoleKey } from './org-membership.entity.js';
import { PostgresOrgMembershipRepository } from './postgres-org-membership.repository.js';
import { PostgresUserRepository } from './postgres-user.repository.js';

export interface SyncClerkMemberInput {
	pool: pg.Pool;
	/** The Meshify org the Clerk session resolved to. */
	orgId: string;
	clerkUserId: string;
	/** Clerk's org role for the session (`org:admin`, `org:member`, or a custom role). */
	clerkOrgRole: string | null | undefined;
	/**
	 * Bring a `removed` membership back. The caller must first confirm with the
	 * Clerk membership API that the person really is a member again: a session
	 * claim can be up to a minute stale, and trusting it would let a just-removed
	 * member walk back in.
	 */
	reactivateRemoved?: boolean;
}

export interface SyncedClerkMember {
	userId: string;
	/** True the first time this person is seen, so the caller can fetch their profile. */
	userCreated: boolean;
	orgMembershipId: string;
	orgRole: OrgRoleKey;
	status: OrgMembershipStatus;
}

/**
 * Just-in-time mirror of a Clerk session into Postgres: ensures the `users` row
 * and the `org_memberships` row exist, and returns Meshify's view of the member.
 *
 * Clerk's role only SEEDS a membership. Once the row exists, the Meshify role is
 * authoritative and a later Clerk role change does not move it - roles are
 * managed in Meshify. The seed is: nobody owns this org yet and Clerk says
 * admin -> owner; otherwise Clerk admin -> admin; otherwise member.
 *
 * The organization row is locked for the transaction, so two first requests
 * from a new org cannot both elect themselves owner.
 */
export async function syncClerkMember(input: SyncClerkMemberInput): Promise<SyncedClerkMember> {
	const { pool, orgId, clerkUserId, clerkOrgRole, reactivateRemoved = false } = input;

	return withTransaction(pool, async (client) => {
		const users = new PostgresUserRepository(client);
		const memberships = new PostgresOrgMembershipRepository(client);

		const { user, created } = await users.upsertByClerkId(clerkUserId);

		if (!(await memberships.lockOrganization(orgId))) throw new Error(`Organization ${orgId} does not exist`);

		const existing = await memberships.findByOrgAndUser(orgId, user.id);
		if (existing && existing.status !== 'removed') {
			return { userId: user.id, userCreated: created, orgMembershipId: existing.id, orgRole: existing.roleKey, status: existing.status };
		}

		const seed = await seedRole(memberships, orgId, clerkOrgRole);

		if (existing) {
			if (!reactivateRemoved) {
				return { userId: user.id, userCreated: created, orgMembershipId: existing.id, orgRole: existing.roleKey, status: 'removed' };
			}
			const revived = await memberships.reactivate(orgId, user.id, seed);
			if (!revived) throw new Error(`org_memberships row ${existing.id} changed during reactivation`);
			return { userId: user.id, userCreated: created, orgMembershipId: revived.id, orgRole: revived.roleKey, status: revived.status };
		}

		const membership = await memberships.create({ orgId, userId: user.id, roleKey: seed });
		return { userId: user.id, userCreated: created, orgMembershipId: membership.id, orgRole: membership.roleKey, status: membership.status };
	});
}

async function seedRole(memberships: PostgresOrgMembershipRepository, orgId: string, clerkOrgRole: string | null | undefined): Promise<OrgRoleKey> {
	if (clerkOrgRole !== 'org:admin') return 'member';
	return (await memberships.hasActiveOwner(orgId)) ? 'admin' : 'owner';
}
