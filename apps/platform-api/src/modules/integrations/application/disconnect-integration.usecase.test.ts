import { describe, expect, it } from 'vitest';
import { DisconnectIntegrationUseCase } from './disconnect-integration.usecase.js';
import { IntegrationNotFoundError } from './integration-support.js';
import { InMemoryIntegrationRepository, InMemoryKnowledgeConnectorRepository } from '@meshify/testing';
import { CredentialVault, ProviderRegistry } from '@meshify/providers';
import { InMemoryCredentialStore, InMemoryPlatformEventBus, buildIntegration, fakeCipher } from '@meshify/providers/testing';
import { SLACK_MANIFEST, SlackProvider } from '@meshify/providers';
import { FakeSlackTransport } from '@meshify/providers/testing';

function harness() {
	const transport = new FakeSlackTransport();
	const registry = new ProviderRegistry();
	registry.register(
		new SlackProvider({ app: { clientId: 'c', clientSecret: 's', signingSecret: 'sig', redirectUri: 'https://x/cb' }, transport })
	);
	const integration = buildIntegration({ id: 'int-slack', provider: SLACK_MANIFEST.id, orgId: 'org-1', externalAccountId: 'T111', status: 'active' });
	const integrations = new InMemoryIntegrationRepository([integration]);
	const connectors = new InMemoryKnowledgeConnectorRepository();
	const store = new InMemoryCredentialStore();
	const vault = new CredentialVault(store, fakeCipher);
	const events = new InMemoryPlatformEventBus();
	const useCase = new DisconnectIntegrationUseCase(registry, integrations, connectors, vault, events);
	return { transport, integrations, connectors, store, vault, events, useCase };
}

describe('DisconnectIntegrationUseCase', () => {
	it('revokes at the provider, purges credentials, flags dependent connectors, and emits connection.disconnected', async () => {
		const h = harness();
		await h.vault.put('int-slack', 'access_token', 'xoxb-live');
		await h.connectors.create({ id: 'conn-1', projectId: 'proj-1', type: 'slack', displayName: 'Acme', integrationId: 'int-slack' });
		await h.connectors.create({ id: 'conn-2', projectId: 'proj-2', type: 'slack', displayName: 'Acme', integrationId: 'int-slack' });

		await h.useCase.execute({ orgId: 'org-1', integrationId: 'int-slack' });

		expect(h.transport.revoked).toEqual(['xoxb-live']);
		expect(await h.vault.get('int-slack', 'access_token')).toBeUndefined();
		expect((await h.connectors.listByIntegration('int-slack')).map((c) => c.status)).toEqual(['disconnected', 'disconnected']);
		expect((await h.integrations.findById('int-slack'))?.status).toBe('disconnected');
		expect(h.events.published.map((e) => e.kind)).toEqual(['connection.disconnected']);
	});

	it('cross-org disconnect probes look identical to missing integrations', async () => {
		const h = harness();
		await expect(h.useCase.execute({ orgId: 'org-other', integrationId: 'int-slack' })).rejects.toBeInstanceOf(IntegrationNotFoundError);
		expect((await h.integrations.findById('int-slack'))?.status).toBe('active');
	});
});
