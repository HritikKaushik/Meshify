import { describe, expect, it, vi } from 'vitest';
import type { SyncedClerkMember } from '@meshify/data-access';
import type { Logger } from '@meshify/shared';
import { MemberResolver, type MemberResolverDeps } from './member-resolver.js';

const INPUT = { orgId: 'org-uuid', clerkOrgId: 'org_2abc', clerkUserId: 'user_2abc', clerkOrgRole: 'org:member' };

function synced(overrides: Partial<SyncedClerkMember> = {}): SyncedClerkMember {
	return { userId: 'user-uuid', userCreated: false, orgMembershipId: 'm-1', orgRole: 'member', status: 'active', ...overrides };
}

function resolver(overrides: Partial<MemberResolverDeps> = {}) {
	const deps = {
		sync: vi.fn(async () => synced()),
		updateProfile: vi.fn(async () => undefined),
		fetchProfile: vi.fn(async () => ({ email: 'dana@acme.test', displayName: 'Dana', avatarUrl: null })),
		confirmMembership: vi.fn(async () => true),
		logger: { warn: vi.fn() } as unknown as Logger,
		...overrides,
	} satisfies MemberResolverDeps;
	return { members: new MemberResolver(deps), deps };
}

describe('MemberResolver', () => {
	it('mirrors an active member once, then answers from the cache until the ttl passes', async () => {
		let now = 1_000;
		const { members, deps } = resolver({ now: () => now, ttlMs: 60_000 });

		expect(await members.resolve(INPUT)).toEqual({ ok: true, userId: 'user-uuid' });
		expect(await members.resolve(INPUT)).toEqual({ ok: true, userId: 'user-uuid' });
		expect(deps.sync).toHaveBeenCalledTimes(1);

		now += 60_001;
		await members.resolve(INPUT);
		expect(deps.sync).toHaveBeenCalledTimes(2);
	});

	it('fetches the profile from Clerk only the first time a person is seen', async () => {
		const { members, deps } = resolver({ sync: vi.fn(async () => synced({ userCreated: true })) });
		await members.resolve(INPUT);
		expect(deps.fetchProfile).toHaveBeenCalledWith('user_2abc');
		expect(deps.updateProfile).toHaveBeenCalledWith('user-uuid', { email: 'dana@acme.test', displayName: 'Dana', avatarUrl: null });

		const seenBefore = resolver();
		await seenBefore.members.resolve(INPUT);
		expect(seenBefore.deps.fetchProfile).not.toHaveBeenCalled();
	});

	it('a Clerk profile failure is cosmetic: the member still resolves', async () => {
		const { members, deps } = resolver({
			sync: vi.fn(async () => synced({ userCreated: true })),
			fetchProfile: vi.fn(async () => {
				throw new Error('clerk 503');
			}),
		});
		expect(await members.resolve(INPUT)).toEqual({ ok: true, userId: 'user-uuid' });
		expect(deps.logger.warn).toHaveBeenCalled();
	});

	it('refuses a removed member whose removal Clerk still confirms, and never caches the refusal', async () => {
		const { members, deps } = resolver({ sync: vi.fn(async () => synced({ status: 'removed' })), confirmMembership: vi.fn(async () => false) });

		expect(await members.resolve(INPUT)).toEqual({ ok: false, reason: 'not_a_member' });
		expect(deps.confirmMembership).toHaveBeenCalledWith('org_2abc', 'user_2abc');
		expect(deps.sync).toHaveBeenCalledTimes(1);

		await members.resolve(INPUT);
		expect(deps.sync).toHaveBeenCalledTimes(2);
	});

	it('brings a removed member back only after Clerk confirms they rejoined', async () => {
		const sync = vi
			.fn<MemberResolverDeps['sync']>()
			.mockResolvedValueOnce(synced({ status: 'removed' }))
			.mockResolvedValueOnce(synced({ status: 'active' }));
		const { members } = resolver({ sync });

		expect(await members.resolve(INPUT)).toEqual({ ok: true, userId: 'user-uuid' });
		expect(sync).toHaveBeenLastCalledWith(expect.objectContaining({ reactivateRemoved: true }));
	});

	it('refuses a suspended member without consulting Clerk', async () => {
		const { members, deps } = resolver({ sync: vi.fn(async () => synced({ status: 'suspended' })) });
		expect(await members.resolve(INPUT)).toEqual({ ok: false, reason: 'not_a_member' });
		expect(deps.confirmMembership).not.toHaveBeenCalled();
	});

	it('forget() drops a cached member so the next request re-reads Postgres', async () => {
		const { members, deps } = resolver();
		await members.resolve(INPUT);
		members.forget('org_2abc', 'user_2abc');
		await members.resolve(INPUT);
		expect(deps.sync).toHaveBeenCalledTimes(2);
	});

	it('evicts the oldest entry once the cache is full', async () => {
		const { members, deps } = resolver({ maxEntries: 2 });
		await members.resolve({ ...INPUT, clerkUserId: 'user_a' });
		await members.resolve({ ...INPUT, clerkUserId: 'user_b' });
		await members.resolve({ ...INPUT, clerkUserId: 'user_c' });
		expect(deps.sync).toHaveBeenCalledTimes(3);

		await members.resolve({ ...INPUT, clerkUserId: 'user_c' });
		await members.resolve({ ...INPUT, clerkUserId: 'user_b' });
		expect(deps.sync).toHaveBeenCalledTimes(3);

		await members.resolve({ ...INPUT, clerkUserId: 'user_a' });
		expect(deps.sync).toHaveBeenCalledTimes(4);
	});
});
