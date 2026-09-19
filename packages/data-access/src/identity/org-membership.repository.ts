import type { OrgMember, OrgMembership, OrgRoleKey } from './org-membership.entity.js';

export interface CreateOrgMembershipInput {
	orgId: string;
	userId: string;
	roleKey: OrgRoleKey;
	clerkMembershipId?: string | null;
}

export interface OrgMembershipRepository {
	findByOrgAndUser(orgId: string, userId: string): Promise<OrgMembership | undefined>;
	listByOrg(orgId: string): Promise<OrgMember[]>;
	hasActiveOwner(orgId: string): Promise<boolean>;
	create(input: CreateOrgMembershipInput): Promise<OrgMembership>;
	/**
	 * Changes a member's org role. Rejects with `LastOwnerError` when it would
	 * demote the only active owner. Must run inside a transaction that holds the
	 * organization row lock (see `lockOrganization`), or the check can race.
	 */
	updateRole(orgId: string, userId: string, roleKey: OrgRoleKey): Promise<OrgMembership | undefined>;
	/**
	 * Marks the membership removed and deletes the user's project grants in this
	 * org. Same locking and last-owner rule as `updateRole`.
	 */
	markRemoved(orgId: string, userId: string): Promise<boolean>;
	/** Brings a removed membership back, clean: the given role, no project grants. */
	reactivate(orgId: string, userId: string, roleKey: OrgRoleKey): Promise<OrgMembership | undefined>;
	/**
	 * Takes a row lock on the organization for the rest of the transaction.
	 * Serializes owner election and last-owner checks across concurrent requests.
	 */
	lockOrganization(orgId: string): Promise<boolean>;
}
