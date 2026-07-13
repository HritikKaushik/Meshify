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
}
