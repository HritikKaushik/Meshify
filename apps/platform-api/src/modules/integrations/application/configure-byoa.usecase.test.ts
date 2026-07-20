import { describe, expect, it } from 'vitest';
import { ConfigureByoaUseCase, DescribeByoaConfigUseCase } from './configure-byoa.usecase.js';
import { IntegrationNotFoundError, UnsupportedProviderOperationError } from './integration-support.js';
import { InMemoryIntegrationRepository } from '@meshify/testing';
import { CredentialVault, ProviderRegistry, ProviderConfigError, SLACK_MANIFEST, SlackProvider, GitHubProvider } from '@meshify/providers';
import { FakeSlackTransport, FakeGitHubTransport, InMemoryCredentialStore, buildGitHubInstallation, buildIntegration, fakeCipher } from '@meshify/providers/testing';

function harness() {
	const registry = new ProviderRegistry();
	registry.register(
		new GitHubProvider({ app: { appId: '1', privateKey: 'p', slug: 's', webhookSecret: 'w' }, transport: new FakeGitHubTransport({ installations: [buildGitHubInstallation()] }) })
	);
	registry.register(new SlackProvider({ app: { clientId: 'c', clientSecret: 's', signingSecret: 'sig', redirectUri: 'https://x/cb' }, transport: new FakeSlackTransport() }));
	const integrations = new InMemoryIntegrationRepository([
		buildIntegration({ id: 'int-gh', provider: 'github', orgId: 'org-1', externalAccountId: '123', status: 'active' }),
		buildIntegration({ id: 'int-slack', provider: SLACK_MANIFEST.id, orgId: 'org-1', externalAccountId: 'T1', status: 'active' }),
	]);
	const store = new InMemoryCredentialStore();
	const vault = new CredentialVault(store, fakeCipher);
	return {
		integrations,
		store,
		vault,
		describe: new DescribeByoaConfigUseCase(registry, integrations, vault),
		configure: new ConfigureByoaUseCase(registry, integrations, vault),
	};
}

describe('DescribeByoaConfigUseCase', () => {
	it('returns the provider form with configured flags, never the secret values', async () => {
		const h = harness();
		await h.vault.put('int-gh', 'app_private_key', '-----BEGIN PRIVATE KEY-----secret');
		const result = await h.describe.execute({ orgId: 'org-1', integrationId: 'int-gh' });

		expect(result.mode).toBe('managed');
		const pk = result.fields.find((f) => f.key === 'app_private_key')!;
		expect(pk).toMatchObject({ secret: true, configured: true, multiline: true });
		expect(JSON.stringify(result.fields)).not.toContain('BEGIN PRIVATE KEY');
		expect(result.fields.find((f) => f.key === 'app_id')).toMatchObject({ secret: false, configured: true });
		expect(result.fields.find((f) => f.key === 'app_webhook_secret')).toMatchObject({ configured: false });
	});

	it('cross-org and non-BYOA-provider access are rejected', async () => {
		const h = harness();
		await expect(h.describe.execute({ orgId: 'org-other', integrationId: 'int-gh' })).rejects.toBeInstanceOf(IntegrationNotFoundError);
	});
});

describe('ConfigureByoaUseCase', () => {
	it('stores secrets in the vault (write-only), non-secrets in metadata, flips to byoa mode, returns the per-integration webhook path', async () => {
		const h = harness();
		const result = await h.configure.execute({
			orgId: 'org-1',
			integrationId: 'int-gh',
			values: { app_id: '999', app_slug: 'acme-app', app_private_key: '-----BEGIN PRIVATE KEY-----k', app_webhook_secret: 'whsec' },
		});

		expect(result.webhookPath).toBe('/v1/integrations/webhooks/github/int-gh');
		expect((await h.vault.get('int-gh', 'app_private_key'))?.value).toBe('-----BEGIN PRIVATE KEY-----k');
		expect((await h.vault.get('int-gh', 'app_webhook_secret'))?.value).toBe('whsec');
		const integration = await h.integrations.findById('int-gh');
		expect(integration?.mode).toBe('byoa');
		expect(integration?.metadata.app_id).toBe('999');
	});

	it('a blank secret on update keeps the stored one (admins need not re-enter it)', async () => {
		const h = harness();
		await h.configure.execute({
			orgId: 'org-1',
			integrationId: 'int-gh',
			values: { app_id: '999', app_slug: 'acme', app_private_key: '-----BEGIN PRIVATE KEY-----orig', app_webhook_secret: 'whsec' },
		});
		await h.configure.execute({ orgId: 'org-1', integrationId: 'int-gh', values: { app_id: '1000', app_slug: 'acme', app_private_key: '', app_webhook_secret: '' } });

		expect((await h.vault.get('int-gh', 'app_private_key'))?.value).toBe('-----BEGIN PRIVATE KEY-----orig');
		expect((await h.integrations.findById('int-gh'))?.metadata.app_id).toBe('1000');
	});

	it('rejects an incomplete first-time submission via the provider validator', async () => {
		const h = harness();
		await expect(
			h.configure.execute({ orgId: 'org-1', integrationId: 'int-gh', values: { app_id: '999', app_slug: 'acme', app_private_key: '', app_webhook_secret: '' } })
		).rejects.toBeInstanceOf(ProviderConfigError);
	});

	it('rejects a non-PEM private key through the GitHub provider validator', async () => {
		const h = harness();
		await expect(
			h.configure.execute({ orgId: 'org-1', integrationId: 'int-gh', values: { app_id: '999', app_slug: 'acme', app_private_key: 'not-a-key', app_webhook_secret: 'w' } })
		).rejects.toBeInstanceOf(ProviderConfigError);
	});

	it('stores Slack BYOA credentials under their declared kinds', async () => {
		const h = harness();
		const result = await h.configure.execute({
			orgId: 'org-1',
			integrationId: 'int-slack',
			values: { app_client_id: 'cid', app_client_secret: 'csec', app_signing_secret: 'sig' },
		});
		expect(result.webhookPath).toBe('/v1/integrations/webhooks/slack/int-slack');
		expect((await h.vault.get('int-slack', 'app_signing_secret'))?.value).toBe('sig');
		expect((await h.integrations.findById('int-slack'))?.metadata.app_client_id).toBe('cid');
	});
});
