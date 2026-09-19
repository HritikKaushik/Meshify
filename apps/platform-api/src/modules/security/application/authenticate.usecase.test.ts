import { describe, expect, it, vi } from 'vitest';
import { generateApiKey, hashApiKey, type ActiveApiKey, type ApiKeyRepository, type OrgMembership } from '@meshify/data-access';
import { signActorAssertion } from '@meshify/shared';
import { AuthenticateApiKeyUseCase, AuthenticationError, NotAMemberError, type IdentityAssertionOptions } from './authenticate.usecase.js';

const PEPPER = 'test-pepper-at-least-16-chars';
const ORG_ID = '7a9d4e21-0b3c-4f5a-8e6d-1c2b3a4f5e6d';

function fakeRepo(byHash: Record<string, ActiveApiKey>, touch = vi.fn(async () => undefined)) {
	const repo: ApiKeyRepository = {
		create: async () => {
			throw new Error('unused');
		},
		findByHash: async (h) => byHash[h],
		touch,
		revoke: async () => false,
		listByOrg: async () => [],
	};
	return { repo, touch };
}

function activeKey(overrides: Partial<ActiveApiKey> = {}): ActiveApiKey {
	return { id: 'key-1', orgId: ORG_ID, kind: 'service', scopes: [], expiresAt: null, revokedAt: null, ...overrides };
}

describe('AuthenticateApiKeyUseCase', () => {
	it('resolves a valid key to its org context and touches last_used_at', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo, touch } = fakeRepo({ [hash]: activeKey({ scopes: ['read'] }) });

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}` });

		// The key is scoped to ['read'] (non-empty, no 'admin'), so it is NOT an org
		// admin — least privilege — even as a direct caller with no role header.
		expect(auth).toEqual({ orgId: ORG_ID, keyId: 'key-1', keyKind: 'service', scopes: ['read'], isOrgAdmin: false });
		expect(touch).toHaveBeenCalledWith('key-1');
	});

	it.each([
		['admin role → org admin', 'admin', true],
		['member role → not org admin', 'member', false],
		['unknown role → not org admin', 'something-else', false],
		['no role header → full access (direct server key)', undefined, true],
	])('derives isOrgAdmin from the forwarded org role: %s', async (_label, roleHeader, expected) => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo } = fakeRepo({ [hash]: activeKey() });

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}`, orgRole: roleHeader });

		expect(auth.isOrgAdmin).toBe(expected);
	});

	it.each([
		['empty scopes → unrestricted, direct caller is admin', [], undefined, true],
		['scoped key without "admin" → not admin even as direct caller', ['read'], undefined, false],
		['scoped key with "admin" → admin as direct caller', ['admin'], undefined, true],
		['admin-scoped key is still downscoped by a member role', ['admin'], 'member', false],
	])('applies key scopes to isOrgAdmin: %s', async (_label, scopes, roleHeader, expected) => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo } = fakeRepo({ [hash]: activeKey({ scopes }) });

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}`, orgRole: roleHeader });

		expect(auth.isOrgAdmin).toBe(expected);
	});

	it.each([
		['missing header', undefined],
		['non-bearer scheme', 'Basic abc'],
		['malformed key', 'Bearer not-a-real-key'],
	])('rejects %s', async (_label, header) => {
		const { repo } = fakeRepo({});
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: header })).rejects.toBeInstanceOf(AuthenticationError);
	});

	it('carries a well-formed forwarded user id as actorId and drops anything else', async () => {
		const { plaintext } = generateApiKey();
		const { repo } = fakeRepo({ [hashApiKey(PEPPER, plaintext)]: activeKey() });
		expect((await new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}`, orgRole: 'member', actorId: 'user_2abcDEF' })).actorId).toBe('user_2abcDEF');
		expect((await new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}`, orgRole: 'member', actorId: 'user 2abc; drop' })).actorId).toBeUndefined();
		expect((await new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}` })).actorId).toBeUndefined();
	});

	it('rejects an unknown key without leaking that it is unknown', async () => {
		const { plaintext } = generateApiKey();
		const { repo } = fakeRepo({});
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}` })).rejects.toThrow('Invalid API key');
	});

	it('rejects a revoked key', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo } = fakeRepo({ [hash]: activeKey({ revokedAt: new Date() }) });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}` })).rejects.toThrow('Invalid API key');
	});

	it('rejects an expired key', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo } = fakeRepo({ [hash]: activeKey({ expiresAt: new Date(Date.now() - 1000) }) });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}` })).rejects.toThrow('Invalid API key');
	});

	it('does not fail auth if touch rejects', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const touch = vi.fn(async () => {
			throw new Error('db down');
		});
		const { repo } = fakeRepo({ [hash]: activeKey() }, touch);
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}` })).resolves.toMatchObject({ orgId: ORG_ID });
	});

	it('a key hashed under a different pepper does not authenticate', async () => {
		const { plaintext } = generateApiKey();
		const hashUnderOther = hashApiKey('a-completely-different-pepper', plaintext);
		const { repo } = fakeRepo({ [hashUnderOther]: activeKey() });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute({ authorization: `Bearer ${plaintext}` })).rejects.toThrow('Invalid API key');
	});
});

const SECRET = 'unit-test-assertion-secret-not-a-real-key';
const USER_ID = '3f1c2b9e-5a4d-4c7e-9b1a-2d6e8f0a1b2c';
const OTHER_ORG_ID = '11111111-2222-4333-8444-555555555555';

function membership(overrides: Partial<OrgMembership> = {}): OrgMembership {
	const now = new Date();
	return { id: 'm-1', orgId: ORG_ID, userId: USER_ID, roleKey: 'member', status: 'active', clerkMembershipId: null, createdAt: now, updatedAt: now, removedAt: null, ...overrides };
}

function identity(found: OrgMembership | undefined, overrides: Partial<IdentityAssertionOptions> = {}) {
	const onRejected = vi.fn();
	const findByOrgAndUser = vi.fn(async () => found);
	const options: IdentityAssertionOptions = { secret: SECRET, mode: 'permissive', memberships: { findByOrgAndUser }, onRejected, ...overrides };
	return { options, onRejected, findByOrgAndUser };
}

describe('AuthenticateApiKeyUseCase identity assertion', () => {
	function bffKey() {
		const { plaintext } = generateApiKey();
		const { repo } = fakeRepo({ [hashApiKey(PEPPER, plaintext)]: activeKey({ kind: 'bff' }) });
		return { repo, authorization: `Bearer ${plaintext}` };
	}

	it.each([
		['owner', true],
		['admin', true],
		['member', false],
	] as const)('resolves the person and takes authority from their Meshify org role: %s', async (roleKey, isOrgAdmin) => {
		const { repo, authorization } = bffKey();
		const { options, findByOrgAndUser } = identity(membership({ roleKey }));
		const assertion = signActorAssertion(SECRET, { sub: USER_ID, org: ORG_ID });

		// The legacy header says the opposite on purpose: a valid assertion wins.
		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER, options).execute({ authorization, assertion, orgRole: isOrgAdmin ? 'member' : 'admin' });

		expect(auth).toMatchObject({ orgId: ORG_ID, userId: USER_ID, orgRole: roleKey, isOrgAdmin });
		expect(findByOrgAndUser).toHaveBeenCalledWith(ORG_ID, USER_ID);
	});

	it.each([['removed'], ['suspended']] as const)('answers NotAMember for a %s membership, and for no membership at all', async (status) => {
		const { repo, authorization } = bffKey();
		const assertion = signActorAssertion(SECRET, { sub: USER_ID, org: ORG_ID });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER, identity(membership({ status })).options).execute({ authorization, assertion })).rejects.toBeInstanceOf(NotAMemberError);
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER, identity(undefined).options).execute({ authorization, assertion })).rejects.toBeInstanceOf(NotAMemberError);
	});

	it('never reads the assertion on a service key, so a machine credential cannot act as a person', async () => {
		const { plaintext } = generateApiKey();
		const { repo } = fakeRepo({ [hashApiKey(PEPPER, plaintext)]: activeKey({ kind: 'service' }) });
		const { options, findByOrgAndUser } = identity(membership({ roleKey: 'owner' }));
		const assertion = signActorAssertion(SECRET, { sub: USER_ID, org: ORG_ID });

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER, options).execute({ authorization: `Bearer ${plaintext}`, assertion });

		expect(auth.userId).toBeUndefined();
		expect(findByOrgAndUser).not.toHaveBeenCalled();
	});

	it('refuses an assertion minted for another organization', async () => {
		const { repo, authorization } = bffKey();
		const { options, onRejected, findByOrgAndUser } = identity(membership({ roleKey: 'owner' }), { mode: 'required' });
		const assertion = signActorAssertion(SECRET, { sub: USER_ID, org: OTHER_ORG_ID });

		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER, options).execute({ authorization, assertion })).rejects.toBeInstanceOf(AuthenticationError);
		expect(onRejected).toHaveBeenCalledWith('org_mismatch', 'key-1');
		expect(findByOrgAndUser).not.toHaveBeenCalled();
	});

	it('permissive: an unverifiable assertion falls back to the legacy headers and is reported', async () => {
		const { repo, authorization } = bffKey();
		const { options, onRejected } = identity(membership({ roleKey: 'owner' }));
		const tampered = signActorAssertion('a-different-secret-a-different-secret', { sub: USER_ID, org: ORG_ID });

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER, options).execute({ authorization, assertion: tampered, orgRole: 'member' });

		expect(auth).toMatchObject({ isOrgAdmin: false });
		expect(auth.userId).toBeUndefined();
		expect(onRejected).toHaveBeenCalledWith('bad_signature', 'key-1');
	});

	it('permissive: a missing assertion is the old BFF talking - legacy headers, nothing reported', async () => {
		const { repo, authorization } = bffKey();
		const { options, onRejected } = identity(membership());

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER, options).execute({ authorization, orgRole: 'admin' });

		expect(auth).toMatchObject({ isOrgAdmin: true });
		expect(onRejected).not.toHaveBeenCalled();
	});

	it.each([
		['missing', undefined],
		['expired', signActorAssertion(SECRET, { sub: USER_ID, org: ORG_ID }, { now: Date.now() - 10 * 60_000 })],
	])('required: a bff key with a %s assertion is rejected', async (_label, assertion) => {
		const { repo, authorization } = bffKey();
		const { options } = identity(membership({ roleKey: 'owner' }), { mode: 'required' });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER, options).execute({ authorization, assertion, orgRole: 'admin' })).rejects.toBeInstanceOf(AuthenticationError);
	});

	it('ignores assertions entirely while no secret is configured', async () => {
		const { repo, authorization } = bffKey();
		const { options, findByOrgAndUser } = identity(membership({ roleKey: 'owner' }), { secret: undefined });
		const assertion = signActorAssertion(SECRET, { sub: USER_ID, org: ORG_ID });

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER, options).execute({ authorization, assertion, orgRole: 'member' });

		expect(auth).toMatchObject({ isOrgAdmin: false });
		expect(findByOrgAndUser).not.toHaveBeenCalled();
	});
});
