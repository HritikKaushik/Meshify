import type { SyncClerkMemberInput, SyncedClerkMember, UserProfile } from '@meshify/data-access';
import type { Logger } from '@meshify/shared';

export interface ResolveMemberInput {
	/** The Meshify org the Clerk session resolved to. */
	orgId: string;
	clerkOrgId: string;
	clerkUserId: string;
	clerkOrgRole: string | null | undefined;
}

/** `users.id` of the signed-in person, or the reason they may not act in this org. */
export type ResolvedMember = { ok: true; userId: string } | { ok: false; reason: 'not_a_member' };

export interface MemberResolverDeps {
	/** `syncClerkMember` bound to the pool. */
	sync: (input: Omit<SyncClerkMemberInput, 'pool'>) => Promise<SyncedClerkMember>;
	updateProfile: (userId: string, profile: UserProfile) => Promise<void>;
	/** Reads the person's profile from Clerk. Called once, the first time they are seen. */
	fetchProfile: (clerkUserId: string) => Promise<UserProfile>;
	/** Asks Clerk (not the session claim) whether the person is a member of the org right now. */
	confirmMembership: (clerkOrgId: string, clerkUserId: string) => Promise<boolean>;
	logger: Logger;
	ttlMs?: number;
	maxEntries?: number;
	now?: () => number;
}

const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_ENTRIES = 5_000;

/**
 * Mirrors the signed-in Clerk user into Postgres just in time and returns the
 * `users.id` the BFF vouches for.
 *
 * Only ACTIVE members are cached, and only their id, which never changes. The
 * role is deliberately not part of the answer: platform-api reads it from
 * `org_memberships` on every request, so caching here can never serve a stale
 * role, and a member removed while cached is still refused downstream.
 */
export class MemberResolver {
	private readonly cache = new Map<string, { userId: string; expiresAt: number }>();
	private readonly ttlMs: number;
	private readonly maxEntries: number;
	private readonly now: () => number;

	constructor(private readonly deps: MemberResolverDeps) {
		this.ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
		this.maxEntries = deps.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.now = deps.now ?? Date.now;
	}

	async resolve(input: ResolveMemberInput): Promise<ResolvedMember> {
		const cacheKey = `${input.clerkOrgId}:${input.clerkUserId}`;
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expiresAt > this.now()) return { ok: true, userId: cached.userId };

		const request = { orgId: input.orgId, clerkUserId: input.clerkUserId, clerkOrgRole: input.clerkOrgRole };
		let member = await this.deps.sync(request);

		if (member.status === 'removed') {
			// The session still names this org, but a session claim can be a minute
			// stale. Only Clerk's own membership record may bring someone back.
			if (!(await this.deps.confirmMembership(input.clerkOrgId, input.clerkUserId))) return { ok: false, reason: 'not_a_member' };
			member = await this.deps.sync({ ...request, reactivateRemoved: true });
		}
		if (member.status !== 'active') return { ok: false, reason: 'not_a_member' };

		if (member.userCreated) await this.populateProfile(member.userId, input.clerkUserId);

		this.remember(cacheKey, member.userId);
		return { ok: true, userId: member.userId };
	}

	/** Drops a cached member, e.g. when a Clerk webhook reports them removed. */
	forget(clerkOrgId: string, clerkUserId: string): void {
		this.cache.delete(`${clerkOrgId}:${clerkUserId}`);
	}

	/** A missing name or avatar is cosmetic; it must never fail the request it rides on. */
	private async populateProfile(userId: string, clerkUserId: string): Promise<void> {
		try {
			await this.deps.updateProfile(userId, await this.deps.fetchProfile(clerkUserId));
		} catch (err) {
			this.deps.logger.warn({ err, userId }, 'failed to populate user profile from Clerk');
		}
	}

	private remember(cacheKey: string, userId: string): void {
		// Map iteration order is insertion order, so the first key is the oldest.
		if (this.cache.size >= this.maxEntries) {
			const oldest = this.cache.keys().next().value;
			if (oldest !== undefined) this.cache.delete(oldest);
		}
		this.cache.delete(cacheKey);
		this.cache.set(cacheKey, { userId, expiresAt: this.now() + this.ttlMs });
	}
}
