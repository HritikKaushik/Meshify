import { describe, expect, it } from 'vitest';
import { ConfigureRegistrationUseCase, DescribeRegistrationUseCase } from './configure-registration.usecase.js';
import { UnsupportedProviderOperationError } from './integration-support.js';
import { CredentialVault, ProviderConfigError, ProviderRegistry, GitHubProvider, SlackProvider } from '@meshify/providers';
import type { ProviderRegistration, ProviderRegistrationRepository } from '@meshify/data-access';
import { InMemoryCredentialStore, FakeGitHubTransport, FakeSlackTransport, fakeCipher } from '@meshify/providers/testing';

/** In-memory provider_registrations repo. */
function fakeRegistrationRepo(): ProviderRegistrationRepository & { rows: Map<string, ProviderRegistration> } {
	const rows = new Map<string, ProviderRegistration>();
	let seq = 0;
	const key = (orgId: string, provider: string) => `${orgId}:${provider}`;
	return {
		rows,
		async upsert({ orgId, provider, config }) {
			const existing = rows.get(key(orgId, provider));
			const row: ProviderRegistration = {
				id: existing?.id ?? `reg-${++seq}`,
				orgId,
				provider,
				mode: 'byoa',
				config: { ...(existing?.config ?? {}), ...config },
				createdAt: new Date(0),
				updatedAt: new Date(0),
			};
			rows.set(key(orgId, provider), row);
			return row;
		},
		async findByOrgAndProvider(orgId, provider) {
			return rows.get(key(orgId, provider));
		},
		async findById(id) {
			return [...rows.values()].find((r) => r.id === id);
		},
		async listByOrg(orgId) {
			return [...rows.values()].filter((r) => r.orgId === orgId);
		},
		async delete(orgId, provider) {
			rows.delete(key(orgId, provider));
		},
	};
}

function harness() {
	const registry = new ProviderRegistry();
	registry.register(new GitHubProvider({ transportFactory: () => new FakeGitHubTransport() }));
	registry.register(new SlackProvider({ transportFactory: () => new FakeSlackTransport() }));
	const registrations = fakeRegistrationRepo();
	const vault = new CredentialVault(new InMemoryCredentialStore(), fakeCipher);
	return {
		registrations,
		vault,
		describe: new DescribeRegistrationUseCase(registry, registrations, vault),
		configure: new ConfigureRegistrationUseCase(registry, registrations, vault),
	};
}

describe('DescribeRegistrationUseCase', () => {
	it('reports managed mode with no configured secrets before any BYOA registration', async () => {
		const h = harness();
		const result = await h.describe.execute({ orgId: 'org-1', provider: 'github' });
		expect(result.mode).toBe('managed');
		expect(result.fields.every((f) => !f.configured)).toBe(true);
		expect(result.fields.find((f) => f.key === 'app_private_key')).toMatchObject({ secret: true, multiline: true });
	});

	it('after configuring, reports byoa mode + configured flags without echoing secrets', async () => {
		const h = harness();
		await h.configure.execute({ orgId: 'org-1', provider: 'github', values: { app_id: '999', app_slug: 'acme', app_client_id: 'Iv1.cid', app_private_key: '-----BEGIN PRIVATE KEY-----k', app_client_secret: 'csec', app_webhook_secret: 'wh' } });
		const result = await h.describe.execute({ orgId: 'org-1', provider: 'github' });
		expect(result.mode).toBe('byoa');
		expect(result.fields.find((f) => f.key === 'app_private_key')?.configured).toBe(true);
		expect(result.fields.find((f) => f.key === 'app_id')?.configured).toBe(true);
		expect(JSON.stringify(result.fields)).not.toContain('BEGIN PRIVATE KEY');
	});
});

describe('ConfigureRegistrationUseCase', () => {
	it('stores secrets in the registration vault, non-secrets in registration config, returns the per-registration webhook path', async () => {
		const h = harness();
		const result = await h.configure.execute({
			orgId: 'org-1',
			provider: 'github',
			values: { app_id: '999', app_slug: 'acme', app_client_id: 'Iv1.cid', app_private_key: '-----BEGIN PRIVATE KEY-----k', app_client_secret: 'csec', app_webhook_secret: 'wh' },
		});
		const reg = await h.registrations.findByOrgAndProvider('org-1', 'github');
		expect(result.webhookPath).toBe(`/v1/integrations/webhooks/github/${reg!.id}`);
		expect(reg!.config).toMatchObject({ app_id: '999', app_slug: 'acme' });
		expect((await h.vault.get(reg!.id, 'app_private_key'))?.value).toBe('-----BEGIN PRIVATE KEY-----k');
		// Secrets never land in the (non-secret) config.
		expect(reg!.config.app_private_key).toBeUndefined();
	});

	it('a blank secret on update keeps the stored one (validated against the true value)', async () => {
		const h = harness();
		await h.configure.execute({ orgId: 'org-1', provider: 'github', values: { app_id: '999', app_slug: 'acme', app_client_id: 'Iv1.cid', app_private_key: '-----BEGIN PRIVATE KEY-----orig', app_client_secret: 'csec', app_webhook_secret: 'wh' } });
		await h.configure.execute({ orgId: 'org-1', provider: 'github', values: { app_id: '1000', app_slug: 'acme', app_client_id: 'Iv1.cid', app_private_key: '', app_client_secret: '', app_webhook_secret: '' } });
		const reg = await h.registrations.findByOrgAndProvider('org-1', 'github');
		expect((await h.vault.get(reg!.id, 'app_private_key'))?.value).toBe('-----BEGIN PRIVATE KEY-----orig');
		expect(reg!.config.app_id).toBe('1000');
	});

	it('rejects incomplete and malformed submissions via the provider validator', async () => {
		const h = harness();
		await expect(h.configure.execute({ orgId: 'org-1', provider: 'github', values: { app_id: '999', app_slug: 'acme', app_private_key: '', app_webhook_secret: '' } })).rejects.toBeInstanceOf(ProviderConfigError);
		await expect(h.configure.execute({ orgId: 'org-1', provider: 'github', values: { app_id: 'x', app_slug: 'acme', app_private_key: 'nope', app_webhook_secret: 'w' } })).rejects.toBeInstanceOf(ProviderConfigError);
	});

	it('stores Slack BYOA credentials under their declared kinds', async () => {
		const h = harness();
		const result = await h.configure.execute({ orgId: 'org-1', provider: 'slack', values: { app_client_id: 'cid', app_client_secret: 'csec', app_signing_secret: 'sig' } });
		const reg = await h.registrations.findByOrgAndProvider('org-1', 'slack');
		expect(result.webhookPath).toBe(`/v1/integrations/webhooks/slack/${reg!.id}`);
		expect((await h.vault.get(reg!.id, 'app_signing_secret'))?.value).toBe('sig');
		expect(reg!.config.app_client_id).toBe('cid');
	});
});
