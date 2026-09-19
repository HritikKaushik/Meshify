/**
 * A person, global across organizations. Clerk owns authentication; this row is
 * Meshify's stable, FK-able handle for that identity. Membership of an org (and
 * the role held there) lives in `OrgMembership`, never here.
 */
export interface User {
	id: string;
	clerkUserId: string;
	/** Display only - not unique, not an identifier. */
	email: string | null;
	displayName: string | null;
	avatarUrl: string | null;
	lastSeenAt: Date | null;
	/** Set when Clerk reports the user deleted; PII is scrubbed at the same time. */
	deactivatedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface UserProfile {
	email?: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
}
