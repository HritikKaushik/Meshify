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
 * re-provisioning. Called the first time an unrecognized Clerk organization
 * authenticates against the BFF.
 *
 * The three writes run in ONE transaction, and the link insert is
 * `on conflict do nothing`: two first requests from the same new org used to
 * both create an org + live API key, with the loser hitting the unique
 * constraint after its org and key were already committed — an orphan org
 * holding a valid, unreferenced credential nothing could ever revoke. Now the
 * loser rolls its org and key back and returns the winner's link.
 */
export async function provisionOrgForClerk(input: ProvisionOrgForClerkInput): Promise<ClerkOrgLink> {
	const { pool, clerkOrgId, orgName, pepper, encryptionKey } = input;

	const client = await pool.connect();
	let inTransaction = false;
	try {
		await client.query('begin');
		inTransaction = true;

		const { rows } = await client.query<{ id: string }>('insert into organizations (name) values ($1) returning id', [orgName]);
		const org = rows[0];
		if (!org) throw new Error('Failed to create organization for Clerk provisioning');

		const { plaintext, keyPrefix } = generateApiKey();
		const keyHash = hashApiKey(pepper, plaintext);
		const apiKey = await new PostgresApiKeyRepository(client).create({
			orgId: org.id,
			name: `clerk:${clerkOrgId}`,
			keyPrefix,
			keyHash,
			scopes: [],
			expiresAt: null,
		});

		const link = await new PostgresClerkOrgLinkRepository(client, encryptionKey).createIfAbsent({
			clerkOrgId,
			orgId: org.id,
			apiKeyId: apiKey.id,
			apiKeyPlaintext: plaintext,
		});
		if (link) {
			await client.query('commit');
			inTransaction = false;
			return link;
		}

		// Lost the race: a concurrent request linked this Clerk org first. Discard
		// the org + key created above and adopt the winner's link.
		await client.query('rollback');
		inTransaction = false;
		const winner = await new PostgresClerkOrgLinkRepository(pool, encryptionKey).findByClerkOrgId(clerkOrgId);
		if (!winner) throw new Error(`clerk_org_links row for ${clerkOrgId} vanished after a concurrent provision`);
		return winner;
	} catch (err) {
		if (inTransaction) await client.query('rollback').catch(() => undefined);
		throw err;
	} finally {
		client.release();
	}
}
