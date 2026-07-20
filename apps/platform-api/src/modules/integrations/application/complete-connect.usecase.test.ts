import { describe, expect, it } from 'vitest';
import { CompleteConnectUseCase } from './complete-connect.usecase.js';
import { InvalidOAuthStateError } from './integration-support.js';
import { InMemoryIntegrationRepository, InMemoryIntegrationResourceRepository } from '@meshify/testing';
import { CredentialVault, OAuthStateService, ProviderRegistry, CURRENT_MANIFEST_VERSION, NO_CAPABILITIES } from '@meshify/providers';
import type { Provider, OAuthCapable, ResourceBrowsingCapable } from '@meshify/providers';
import { InMemoryCredentialStore, InMemoryOAuthStateStore, InMemoryPlatformEventBus, fakeCipher, fakeRegistrationService } from '@meshify/providers/testing';

/** A minimal OAuth+resources provider — the platform must work for ANY conformant provider. */
function fakeProvider(): Provider & OAuthCapable & ResourceBrowsingCapable {
	return {
		manifest: {
			id: 'fakehub',
			manifestVersion: CURRENT_MANIFEST_VERSION,
			providerVersion: '1.0.0',
			displayName: 'FakeHub',
			category: 'code',
			availability: 'available',
			capabilities: { ...NO_CAPABILITIES, oauth: true, resourcePicker: true },
			auth: { type: 'oauth2' },
			iconKey: 'fakehub',
			summary: 'fake',
		},
		buildConnectUrl: (input) => `https://fakehub.example/authorize?state=${input.stateToken}`,
		completeConnect: async (input) => {
			if (input.params.code !== 'good') throw Object.assign(new Error('bad code'), { name: 'ProviderAuthError' });
			return {
				externalAccountId: 'acct-9',
				externalAccountName: 'Acme FakeHub',
				metadata: { plan: 'pro' },
				credentials: [{ kind: 'access_token', value: 'tok-123', expiresAt: null }],
			};
		},
		listResources: async () => ({ resources: [{ id: 'r1', name: 'repo-one', kind: 'repository', private: true }] }),
	};
}

function harness() {
	const registry = new ProviderRegistry();
	registry.register(fakeProvider());
	const stateStore = new InMemoryOAuthStateStore();
	const states = new OAuthStateService(stateStore);
	const integrations = new InMemoryIntegrationRepository();
	const resources = new InMemoryIntegrationResourceRepository();
	const credentialStore = new InMemoryCredentialStore();
	const vault = new CredentialVault(credentialStore, fakeCipher);
	const events = new InMemoryPlatformEventBus();
	const registrations = fakeRegistrationService({ provider: 'fakehub', mode: 'managed' });
	const useCase = new CompleteConnectUseCase(registry, states, integrations, resources, vault, events, registrations);
	return { registry, states, integrations, resources, credentialStore, vault, events, useCase };
}

describe('CompleteConnectUseCase', () => {
	it('creates the integration, stores credentials via the vault, warms the inventory, and emits connection.established', async () => {
		const h = harness();
		const { token } = await h.states.issue({ orgId: 'org-1', provider: 'fakehub', projectId: 'proj-7', returnPath: '/marketplace' });

		const result = await h.useCase.execute({ orgId: 'org-1', provider: 'fakehub', stateToken: token, params: { code: 'good' } });

		expect(result.integration).toMatchObject({ orgId: 'org-1', provider: 'fakehub', externalAccountId: 'acct-9', status: 'active' });
		expect(result.projectId).toBe('proj-7');
		expect(result.returnPath).toBe('/marketplace');
		expect(await h.vault.get(result.integration.id, 'access_token')).toEqual({ value: 'tok-123', expiresAt: null });
		expect((await h.resources.listByIntegration(result.integration.id)).map((r) => r.resourceId)).toEqual(['r1']);
		expect(h.events.published.map((e) => e.kind)).toEqual(['connection.established']);
	});

	it('rejects a state issued for a different org — the installation-hijack gate', async () => {
		const h = harness();
		const { token } = await h.states.issue({ orgId: 'org-victim', provider: 'fakehub' });
		await expect(
			h.useCase.execute({ orgId: 'org-attacker', provider: 'fakehub', stateToken: token, params: { code: 'good' } })
		).rejects.toBeInstanceOf(InvalidOAuthStateError);
		expect(await h.integrations.listByOrg('org-attacker')).toEqual([]);
	});

	it('rejects replayed and unknown states identically', async () => {
		const h = harness();
		const { token } = await h.states.issue({ orgId: 'org-1', provider: 'fakehub' });
		await h.useCase.execute({ orgId: 'org-1', provider: 'fakehub', stateToken: token, params: { code: 'good' } });
		await expect(h.useCase.execute({ orgId: 'org-1', provider: 'fakehub', stateToken: token, params: { code: 'good' } })).rejects.toBeInstanceOf(
			InvalidOAuthStateError
		);
		await expect(
			h.useCase.execute({ orgId: 'org-1', provider: 'fakehub', stateToken: 'never-issued', params: { code: 'good' } })
		).rejects.toBeInstanceOf(InvalidOAuthStateError);
	});

	it('reconnecting the same account updates it instead of duplicating, and rotates credentials', async () => {
		const h = harness();
		const first = await h.states.issue({ orgId: 'org-1', provider: 'fakehub' });
		const { integration } = await h.useCase.execute({ orgId: 'org-1', provider: 'fakehub', stateToken: first.token, params: { code: 'good' } });

		const second = await h.states.issue({ orgId: 'org-1', provider: 'fakehub', intent: 'reconnect', integrationId: integration.id });
		const result = await h.useCase.execute({ orgId: 'org-1', provider: 'fakehub', stateToken: second.token, params: { code: 'good' } });

		expect(result.integration.id).toBe(integration.id);
		expect(result.intent).toBe('reconnect');
		expect((await h.integrations.listByOrg('org-1')).length).toBe(1);
	});

	it('does not create anything when the provider rejects the callback', async () => {
		const h = harness();
		const { token } = await h.states.issue({ orgId: 'org-1', provider: 'fakehub' });
		await expect(h.useCase.execute({ orgId: 'org-1', provider: 'fakehub', stateToken: token, params: { code: 'BAD' } })).rejects.toThrow();
		expect(await h.integrations.listByOrg('org-1')).toEqual([]);
		expect(h.events.published).toEqual([]);
	});
});
