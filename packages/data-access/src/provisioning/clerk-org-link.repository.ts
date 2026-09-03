import type { ClerkOrgLink } from './clerk-org-link.entity.js';

export interface CreateClerkOrgLinkInput {
	clerkOrgId: string;
	orgId: string;
	apiKeyId: string;
	/** Plaintext — encrypted by the repository before storage. */
	apiKeyPlaintext: string;
}

export interface ClerkOrgLinkRepository {
	findByClerkOrgId(clerkOrgId: string): Promise<ClerkOrgLink | undefined>;
	create(input: CreateClerkOrgLinkInput): Promise<ClerkOrgLink>;
	/**
	 * Inserts the link unless one already exists for `clerkOrgId`, in which case it
	 * returns undefined without touching the row (`on conflict do nothing`). Lets a
	 * provisioning transaction detect that it lost a first-sign-in race.
	 */
	createIfAbsent(input: CreateClerkOrgLinkInput): Promise<ClerkOrgLink | undefined>;
}
