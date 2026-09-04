import { hashApiKey, looksLikeApiKey, type ApiKeyRepository, type AuthContext } from '@meshify/data-access';

/** Thrown when a presented credential is missing, malformed, unknown, revoked, or expired. */
export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

/**
 * Resolves a raw `Authorization` header into an org-scoped AuthContext.
 *
 * Deliberately returns the SAME error for missing / malformed / unknown /
 * revoked / expired keys — distinguishing them would let a caller probe which
 * keys exist. `last_used_at` is updated best-effort and never blocks the
 * request (a failed touch must not deny a valid key).
 */
export class AuthenticateApiKeyUseCase {
	constructor(
		private readonly apiKeys: ApiKeyRepository,
		private readonly pepper: string
	) {}

	/**
	 * @param authorizationHeader the raw `Authorization` header (Bearer msk_…).
	 * @param orgRoleHeader the BFF-forwarded, trusted `X-Meshify-Org-Role`
	 *   (`admin`/`member`). ABSENT means a direct API-key caller (a server
	 *   credential that never passes through the BFF) — treated as full-access.
	 *   The BFF always sets this header authoritatively from the Clerk session,
	 *   overwriting any browser-supplied value, so a member cannot forge `admin`.
	 * @param actorHeader the BFF-forwarded `X-Meshify-User-Id` (the Clerk user
	 *   id), set the same authoritative way. Only used to key rate limits per
	 *   user; a value that is not a plain identifier is ignored, never trusted.
	 */
	async execute(authorizationHeader: string | undefined, orgRoleHeader?: string, actorHeader?: string): Promise<AuthContext> {
		const presented = extractBearer(authorizationHeader);
		if (!presented || !looksLikeApiKey(presented)) {
			throw new AuthenticationError('Missing or malformed API key');
		}

		const keyHash = hashApiKey(this.pepper, presented);
		const key = await this.apiKeys.findByHash(keyHash);
		if (!key || key.revokedAt !== null) {
			throw new AuthenticationError('Invalid API key');
		}
		if (key.expiresAt !== null && key.expiresAt.getTime() <= Date.now()) {
			throw new AuthenticationError('Invalid API key');
		}

		// Fire-and-forget; swallow errors so telemetry never gates authentication.
		void this.apiKeys.touch(key.id).catch(() => undefined);

		// A key's scopes cap what it can do: EMPTY scopes = unrestricted (the shared
		// org key + every existing/Clerk-provisioned key — unchanged behaviour); a
		// non-empty scope list is least-privilege, and org-admin then requires an
		// explicit `admin` scope. The BFF-forwarded role further downscopes Clerk
		// users (a member is never admin regardless of the key's scopes).
		const keyIsAdminCapable = key.scopes.length === 0 || key.scopes.includes('admin');
		const roleIsAdmin = orgRoleHeader === undefined ? true : orgRoleHeader === 'admin';
		const isOrgAdmin = keyIsAdminCapable && roleIsAdmin;
		const actorId = actorHeader && ACTOR_ID_PATTERN.test(actorHeader) ? actorHeader : undefined;
		return { orgId: key.orgId, keyId: key.id, scopes: key.scopes, isOrgAdmin, ...(actorId ? { actorId } : {}) };
	}
}

/** Clerk user ids look like `user_2abc...`; anything outside this shape is dropped rather than used as a limiter key. */
const ACTOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function extractBearer(header: string | undefined): string | undefined {
	if (!header) return undefined;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1]?.trim();
}
