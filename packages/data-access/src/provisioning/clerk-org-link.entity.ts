/** Resolved link between a Clerk organization and its Meshify org + API key. */
export interface ClerkOrgLink {
	id: string;
	clerkOrgId: string;
	orgId: string;
	apiKeyId: string;
	/** Decrypted plaintext — the value sent as `Authorization: Bearer <apiKeyPlaintext>`. */
	apiKeyPlaintext: string;
	createdAt: Date;
}
