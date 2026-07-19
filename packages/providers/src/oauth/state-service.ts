import { createHash, randomBytes } from 'node:crypto';
import type { OAuthState } from '@meshify/data-access';

/** Structural subset of OAuthStateRepository — satisfied by data-access at the composition root. */
export interface OAuthStateStore {
	create(input: {
		stateHash: string;
		orgId: string;
		provider: string;
		projectId?: string | null;
		intent?: 'connect' | 'reconnect';
		integrationId?: string | null;
		returnPath?: string | null;
		createdByKeyId?: string | null;
		expiresAt: Date;
	}): Promise<OAuthState>;
	consumeByHash(stateHash: string, now: Date): Promise<OAuthState | undefined>;
}

export interface IssueStateInput {
	orgId: string;
	provider: string;
	projectId?: string | null;
	intent?: 'connect' | 'reconnect';
	integrationId?: string | null;
	returnPath?: string | null;
	createdByKeyId?: string | null;
}

const STATE_TTL_MS = 15 * 60 * 1000;

/** The state token is 256 bits of entropy; only its SHA-256 lands in the DB. */
export function hashStateToken(token: string): string {
	return createHash('sha256').update(token).digest('base64url');
}

/**
 * Server-side, single-use OAuth state. Replaces the signed-state + browser
 * sessionStorage pattern: the callback resolves org/project/return-path
 * entirely from the consumed row, and a state can never be replayed.
 */
export class OAuthStateService {
	constructor(
		private readonly store: OAuthStateStore,
		private readonly ttlMs: number = STATE_TTL_MS,
		private readonly now: () => Date = () => new Date(),
		private readonly generateToken: () => string = () => randomBytes(32).toString('base64url')
	) {}

	async issue(input: IssueStateInput): Promise<{ token: string; state: OAuthState }> {
		const token = this.generateToken();
		const state = await this.store.create({
			...input,
			stateHash: hashStateToken(token),
			expiresAt: new Date(this.now().getTime() + this.ttlMs),
		});
		return { token, state };
	}

	/** Atomically consume; undefined for unknown/expired/replayed tokens (indistinguishable by design). */
	async consume(token: string): Promise<OAuthState | undefined> {
		return this.store.consumeByHash(hashStateToken(token), this.now());
	}
}
