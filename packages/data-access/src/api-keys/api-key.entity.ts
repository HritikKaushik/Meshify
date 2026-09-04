import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** A stored API key. `keyHash` is never exposed outside the repository layer. */
export interface ApiKey {
	id: string;
	orgId: string;
	name: string;
	keyPrefix: string;
	scopes: string[];
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	revokedAt: Date | null;
	createdAt: Date;
}

/** Result of authenticating a presented key. Attached to `req.auth`. */
export interface AuthContext {
	orgId: string;
	keyId: string;
	scopes: string[];
	/**
	 * The end user behind a BFF-forwarded request (the Clerk user id), when
	 * present. Rate limits key on it so one user cannot exhaust the budget of
	 * the org key every browser session shares. Absent for direct API-key callers.
	 */
	actorId?: string;
	/**
	 * Whether this request may perform org-admin actions (manage AI providers,
	 * delete projects, manage connectors/integrations). Derived from the
	 * BFF-forwarded Clerk org role: a Clerk `org:admin` → true, `org:member` →
	 * false. A request with no forwarded role is a direct API-key caller (a
	 * server credential issued out-of-band) and is treated as full-access.
	 */
	isOrgAdmin: boolean;
}

const KEY_PREFIX = 'msk_';
/** Chars of the plaintext kept for identification (`msk_` + 8 hex-ish chars). */
const IDENTIFIER_LENGTH = KEY_PREFIX.length + 8;

/**
 * Mints a new API key. Returns the one-time plaintext (shown to the caller and
 * never persisted) and the non-secret prefix for display. 24 random bytes →
 * 32 base64url chars of entropy, well beyond guessing range.
 */
export function generateApiKey(): { plaintext: string; keyPrefix: string } {
	const secret = randomBytes(24).toString('base64url');
	const plaintext = `${KEY_PREFIX}${secret}`;
	return { plaintext, keyPrefix: plaintext.slice(0, IDENTIFIER_LENGTH) };
}

/**
 * Deterministic keyed hash of a plaintext key. The pepper is a server-held
 * secret (env), so the stored hash is useless to an attacker who only has the
 * database. Base64 for compact, index-friendly storage.
 */
export function hashApiKey(pepper: string, plaintext: string): string {
	return createHmac('sha256', pepper).update(plaintext).digest('base64');
}

/** Cheap shape check before hashing/DB work, to reject obvious non-keys. */
export function looksLikeApiKey(value: string): boolean {
	return value.startsWith(KEY_PREFIX) && value.length > IDENTIFIER_LENGTH;
}

/** Constant-time comparison of two already-computed hashes. */
export function hashesEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}
