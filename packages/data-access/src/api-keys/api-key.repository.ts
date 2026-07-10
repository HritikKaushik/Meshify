import type { ApiKey } from './api-key.entity.js';

export interface CreateApiKeyInput {
	orgId: string;
	name: string;
	keyPrefix: string;
	keyHash: string;
	scopes: string[];
	expiresAt: Date | null;
}

/**
 * An active key resolved by hash: only the fields the auth path needs, plus
 * enough to reject revoked/expired keys. Never carries the hash back out.
 */
export interface ActiveApiKey {
	id: string;
	orgId: string;
	scopes: string[];
	expiresAt: Date | null;
	revokedAt: Date | null;
}

export interface ApiKeyRepository {
	create(input: CreateApiKeyInput): Promise<ApiKey>;
	/** Looks up a key by its stored hash. Returns undefined if no row matches. */
	findByHash(keyHash: string): Promise<ActiveApiKey | undefined>;
	/** Best-effort, fire-and-forget update of last_used_at; must not block auth. */
	touch(id: string): Promise<void>;
	revoke(id: string): Promise<boolean>;
	listByOrg(orgId: string): Promise<ApiKey[]>;
}
