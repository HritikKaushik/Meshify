import type { OAuthState } from './oauth-state.entity.js';

export interface CreateOAuthStateInput {
	stateHash: string;
	orgId: string;
	provider: string;
	projectId?: string | null;
	intent?: 'connect' | 'reconnect';
	integrationId?: string | null;
	returnPath?: string | null;
	createdByKeyId?: string | null;
	expiresAt: Date;
}

export interface OAuthStateRepository {
	create(input: CreateOAuthStateInput): Promise<OAuthState>;
	/**
	 * Atomically consume the unexpired, unconsumed state with this hash.
	 * Returns undefined for unknown, expired, or already-consumed states —
	 * indistinguishable by design.
	 */
	consumeByHash(stateHash: string, now: Date): Promise<OAuthState | undefined>;
	deleteExpiredBefore(before: Date): Promise<number>;
}
