import type pg from 'pg';
import { generateApiKey, hashApiKey } from '../api-keys/api-key.entity.js';
import { PostgresApiKeyRepository } from '../api-keys/postgres-api-key.repository.js';
import { PostgresClerkOrgLinkRepository } from './postgres-clerk-org-link.repository.js';
import type { ClerkOrgLink } from './clerk-org-link.entity.js';

export interface ProvisionOrgForClerkInput {
	clerkOrgId: string;
	orgName: string;
	pool: pg.Pool;
	/** Must match `PLATFORM_API_KEY_PEPPER` used by platform-api — same hashing scheme, same verifier. */
	pepper: string;
	/** `ORG_KEY_ENCRYPTION_KEY` — encrypts the plaintext key at rest in `clerk_org_links`. */
	encryptionKey: string;
}

/**
 * Self-serve counterpart to `scripts/issue-api-key.ts`: creates a Meshify org,
 * mints an API key for it (same `generateApiKey`/`hashApiKey` primitives the
 * CLI uses), and records the Clerk↔org↔key link so future sign-ins resolve
 * instantly via `ClerkOrgLinkRepository.findByClerkOrgId` instead of
 * re-provisioning. Called once, the first time an unrecognized Clerk
 * organization authenticates against the BFF.
 */
export async function provisionOrgForClerk(input: ProvisionOrgForClerkInput): Promise<ClerkOrgLink> {
	const { pool, clerkOrgId, orgName, pepper, encryptionKey } = input;

	const { rows } = await pool.query<{ id: string }>('insert into organizations (name) values ($1) returning id', [orgName]);
	const org = rows[0];
	if (!org) throw new Error('Failed to create organization for Clerk provisioning');

	const { plaintext, keyPrefix } = generateApiKey();
	const keyHash = hashApiKey(pepper, plaintext);

	const apiKeys = new PostgresApiKeyRepository(pool);
	const apiKey = await apiKeys.create({
		orgId: org.id,
		name: `clerk:${clerkOrgId}`,
		keyPrefix,
		keyHash,
		scopes: [],
		expiresAt: null,
	});

	const links = new PostgresClerkOrgLinkRepository(pool, encryptionKey);
	return links.create({ clerkOrgId, orgId: org.id, apiKeyId: apiKey.id, apiKeyPlaintext: plaintext });
}
