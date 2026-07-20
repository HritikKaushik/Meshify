import { describe, expect, it } from 'vitest';
import { ProviderRegistrationService, type RegistrationStore } from './provider-registration-service.js';
import { CredentialVault } from '../vault/credential-vault.js';
import { InMemoryCredentialStore, fakeCipher } from '../testing/fakes.js';

function service(seed: { byoa?: Record<string, { id: string; config: Record<string, unknown> }> } = {}) {
	const rows = new Map(Object.entries(seed.byoa ?? {})); // key = `${orgId}:${provider}`
	const byId = new Map<string, { id: string; provider: string; config: Record<string, unknown> }>();
	for (const [key, row] of rows) byId.set(row.id, { id: row.id, provider: key.split(':')[1]!, config: row.config });
	const store: RegistrationStore = {
		findByOrgAndProvider: async (orgId, provider) => rows.get(`${orgId}:${provider}`),
		findById: async (id) => byId.get(id),
	};
	const registrationVault = new CredentialVault(new InMemoryCredentialStore(), fakeCipher);
	const managed = new Map([['github', { config: { app_id: '1', app_slug: 'managed-app' }, secrets: { app_private_key: 'MANAGED-KEY', app_webhook_secret: 'managed-wh' } }]]);
	return { service: new ProviderRegistrationService(store, registrationVault, managed), registrationVault };
}

describe('ProviderRegistrationService', () => {
	it('resolves the virtual managed registration from env when no BYOA row exists', async () => {
		const { service: svc } = service();
		const reg = await svc.resolve('org-1', 'github');
		expect(reg).toMatchObject({ provider: 'github', mode: 'managed', config: { app_id: '1', app_slug: 'managed-app' } });
		expect((await reg!.secrets.get('app_private_key'))?.value).toBe('MANAGED-KEY');
		// Managed secrets are read-only.
		await expect(reg!.secrets.put('app_private_key', 'x')).rejects.toThrow(/read-only/);
	});

	it('a BYOA registration overrides the managed one and exposes its own secrets', async () => {
		const { service: svc, registrationVault } = service({ byoa: { 'org-1:github': { id: 'reg-1', config: { app_id: '999', app_slug: 'acme-app' } } } });
		await registrationVault.put('reg-1', 'app_private_key', 'BYOA-KEY');
		const reg = await svc.resolve('org-1', 'github');
		expect(reg).toMatchObject({ provider: 'github', mode: 'byoa', registrationId: 'reg-1', config: { app_slug: 'acme-app' } });
		expect((await reg!.secrets.get('app_private_key'))?.value).toBe('BYOA-KEY');
	});

	it('returns undefined when neither a managed env nor a BYOA registration exists', async () => {
		const { service: svc } = service();
		expect(await svc.resolve('org-1', 'slack')).toBeUndefined();
		expect(await svc.isConfigured('org-1', 'slack')).toBe(false);
		expect(await svc.isConfigured('org-1', 'github')).toBe(true);
	});

	it('resolveForIntegration follows the integration registration_id, else the managed app', async () => {
		const { service: svc, registrationVault } = service({ byoa: { 'org-1:github': { id: 'reg-1', config: { app_slug: 'acme-app' } } } });
		await registrationVault.put('reg-1', 'app_private_key', 'BYOA-KEY');

		const bound = await svc.resolveForIntegration({ orgId: 'org-1', provider: 'github', registrationId: 'reg-1' });
		expect(bound?.mode).toBe('byoa');

		// A managed integration (registration_id null) stays managed even though a
		// BYOA row now exists — its installation is bound to the managed app.
		const managed = await svc.resolveForIntegration({ orgId: 'org-1', provider: 'github', registrationId: null });
		expect(managed?.mode).toBe('managed');
	});

	it('managedContext + resolveById back the two webhook routes', async () => {
		const { service: svc, registrationVault } = service({ byoa: { 'org-1:github': { id: 'reg-1', config: {} } } });
		await registrationVault.put('reg-1', 'app_webhook_secret', 'byoa-wh');
		expect((await svc.managedContext('github')!.secrets.get('app_webhook_secret'))?.value).toBe('managed-wh');
		expect((await (await svc.resolveById('reg-1'))!.secrets.get('app_webhook_secret'))?.value).toBe('byoa-wh');
		expect(svc.managedContext('slack')).toBeUndefined();
	});
});
