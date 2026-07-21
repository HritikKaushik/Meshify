import { describe, expect, it, vi } from 'vitest';
import { generateApiKey, hashApiKey, type ActiveApiKey, type ApiKeyRepository } from '@meshify/data-access';
import { AuthenticateApiKeyUseCase, AuthenticationError } from './authenticate.usecase.js';

const PEPPER = 'test-pepper-at-least-16-chars';

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
	return { id: 'key-1', orgId: 'org-1', scopes: [], expiresAt: null, revokedAt: null, ...overrides };
}

describe('AuthenticateApiKeyUseCase', () => {
	it('resolves a valid key to its org context and touches last_used_at', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo, touch } = fakeRepo({ [hash]: activeKey({ scopes: ['read'] }) });

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER).execute(`Bearer ${plaintext}`);

		// No forwarded role header ⇒ direct server-key caller ⇒ full access.
		expect(auth).toEqual({ orgId: 'org-1', keyId: 'key-1', scopes: ['read'], isOrgAdmin: true });
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

		const auth = await new AuthenticateApiKeyUseCase(repo, PEPPER).execute(`Bearer ${plaintext}`, roleHeader);

		expect(auth.isOrgAdmin).toBe(expected);
	});

	it.each([
		['missing header', undefined],
		['non-bearer scheme', 'Basic abc'],
		['malformed key', 'Bearer not-a-real-key'],
	])('rejects %s', async (_label, header) => {
		const { repo } = fakeRepo({});
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute(header)).rejects.toBeInstanceOf(AuthenticationError);
	});

	it('rejects an unknown key without leaking that it is unknown', async () => {
		const { plaintext } = generateApiKey();
		const { repo } = fakeRepo({});
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute(`Bearer ${plaintext}`)).rejects.toThrow('Invalid API key');
	});

	it('rejects a revoked key', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo } = fakeRepo({ [hash]: activeKey({ revokedAt: new Date() }) });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute(`Bearer ${plaintext}`)).rejects.toThrow('Invalid API key');
	});

	it('rejects an expired key', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const { repo } = fakeRepo({ [hash]: activeKey({ expiresAt: new Date(Date.now() - 1000) }) });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute(`Bearer ${plaintext}`)).rejects.toThrow('Invalid API key');
	});

	it('does not fail auth if touch rejects', async () => {
		const { plaintext } = generateApiKey();
		const hash = hashApiKey(PEPPER, plaintext);
		const touch = vi.fn(async () => {
			throw new Error('db down');
		});
		const { repo } = fakeRepo({ [hash]: activeKey() }, touch);
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute(`Bearer ${plaintext}`)).resolves.toMatchObject({ orgId: 'org-1' });
	});

	it('a key hashed under a different pepper does not authenticate', async () => {
		const { plaintext } = generateApiKey();
		const hashUnderOther = hashApiKey('a-completely-different-pepper', plaintext);
		const { repo } = fakeRepo({ [hashUnderOther]: activeKey() });
		await expect(new AuthenticateApiKeyUseCase(repo, PEPPER).execute(`Bearer ${plaintext}`)).rejects.toThrow('Invalid API key');
	});
});
