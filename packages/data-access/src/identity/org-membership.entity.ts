/** Structural org roles. Project roles are separate, see `ProjectMembership`. */
export type OrgRoleKey = 'owner' | 'admin' | 'member';
export type OrgMembershipStatus = 'active' | 'suspended' | 'removed';

export const ORG_ROLE_KEYS: readonly OrgRoleKey[] = ['owner', 'admin', 'member'];

export interface OrgMembership {
	id: string;
	orgId: string;
	userId: string;
	roleKey: OrgRoleKey;
	status: OrgMembershipStatus;
	clerkMembershipId: string | null;
	createdAt: Date;
	updatedAt: Date;
	removedAt: Date | null;
}

/** A membership joined with the person it belongs to, for member listings. */
export interface OrgMember extends OrgMembership {
	email: string | null;
	displayName: string | null;
	avatarUrl: string | null;
	lastSeenAt: Date | null;
}

/** Thrown when a change would leave an organization without an active owner. */
export class LastOwnerError extends Error {
	constructor() {
		super('An organization must keep at least one active owner');
		this.name = 'LastOwnerError';
	}
}
