import { describe, expect, it } from 'vitest';
import type { AuthContext, Organization, OrganizationRepository, User, UserRepository } from '@meshify/data-access';
import { GetMeUseCase } from './get-me.usecase.js';

const ORG: Organization = { id: 'org-1', name: 'Acme', plan: 'free', createdAt: new Date() };
const USER: User = {
	id: 'user-1',
	clerkUserId: 'user_2abc',
	email: 'dana@acme.test',
	displayName: 'Dana',
	avatarUrl: null,
	lastSeenAt: null,
	deactivatedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

function useCase(org: Organization | undefined, user: User | undefined) {
	const organizations: OrganizationRepository = { findById: async () => org };
	const users = { findById: async () => user } as unknown as UserRepository;
	return new GetMeUseCase(organizations, users);
}

describe('GetMeUseCase', () => {
	it('describes a signed-in person with their org role', async () => {
		const auth: AuthContext = { orgId: 'org-1', keyId: 'key-1', scopes: [], isOrgAdmin: true, userId: 'user-1', orgRole: 'owner' };
		expect(await useCase(ORG, USER).execute(auth)).toEqual({
			principalKind: 'user',
			org: { id: 'org-1', name: 'Acme' },
			user: { id: 'user-1', email: 'dana@acme.test', displayName: 'Dana', avatarUrl: null },
			orgRole: 'owner',
			isOrgAdmin: true,
		});
	});

	it('describes a key acting on its own as a service principal with no person and no role', async () => {
		const auth: AuthContext = { orgId: 'org-1', keyId: 'key-1', scopes: ['read'], isOrgAdmin: false };
		expect(await useCase(ORG, undefined).execute(auth)).toEqual({ principalKind: 'service', org: { id: 'org-1', name: 'Acme' }, user: null, orgRole: null, isOrgAdmin: false });
	});

	it('fails loudly if the organization disappeared mid-request', async () => {
		await expect(useCase(undefined, undefined).execute({ orgId: 'org-1', keyId: 'key-1', scopes: [], isOrgAdmin: true })).rejects.toThrow(/vanished/);
	});
});
