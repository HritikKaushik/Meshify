import type { clerkClient } from '@clerk/express';
import type { UserProfile } from '@meshify/data-access';

type ClerkClient = typeof clerkClient;

/** A person's organizations are few; one page is the whole list for any realistic account. */
const MEMBERSHIP_PAGE_SIZE = 100;

/** The display fields Meshify keeps for a person. Clerk remains the source of truth for all of them. */
export async function fetchClerkProfile(clerk: ClerkClient, clerkUserId: string): Promise<UserProfile> {
	const user = await clerk.users.getUser(clerkUserId);
	return {
		email: user.primaryEmailAddress?.emailAddress ?? null,
		displayName: user.fullName ?? user.username ?? null,
		avatarUrl: user.imageUrl || null,
	};
}

/**
 * Whether Clerk's own membership record - not the session claim, which can be
 * a minute stale - says this person belongs to the organization right now.
 */
export async function confirmClerkMembership(clerk: ClerkClient, clerkOrgId: string, clerkUserId: string): Promise<boolean> {
	const memberships = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId, limit: MEMBERSHIP_PAGE_SIZE });
	return memberships.data.some((membership) => membership.organization.id === clerkOrgId);
}
