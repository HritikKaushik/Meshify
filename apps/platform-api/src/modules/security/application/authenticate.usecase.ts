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

	async execute(authorizationHeader: string | undefined): Promise<AuthContext> {
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

		return { orgId: key.orgId, keyId: key.id, scopes: key.scopes };
	}
}

function extractBearer(header: string | undefined): string | undefined {
	if (!header) return undefined;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1]?.trim();
}
