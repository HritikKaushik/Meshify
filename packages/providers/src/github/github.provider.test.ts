import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGitHubProvider } from './github.provider.js';
import type { GitHubProviderDeps } from './deps.js';
import { providerContractTests } from '../testing/contract-tests.js';
import { FakeGitHubTransport, buildGitHubInstallation, buildIntegration, fakeVaultHandle, fakeRegistration } from '../testing/fakes.js';
import { ProviderAuthError, ProviderNotConfiguredError } from '../base/errors.js';
import type { RawWebhookRequest } from '../base/webhook.js';

const WEBHOOK_SECRET = 'wh-secret';

function signedGitHubRequest(eventName: string, payload: Record<string, unknown>, deliveryId = 'delivery-1'): RawWebhookRequest {
	const rawBody = Buffer.from(JSON.stringify(payload));
	return {
		rawBody,
		headers: {
			'x-github-event': eventName,
			'x-github-delivery': deliveryId,
			'x-hub-signature-256': `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')}`,
		},
	};
}

function deps(overrides: { transport?: FakeGitHubTransport } = {}): GitHubProviderDeps {
	const transport =
		overrides.transport ??
		new FakeGitHubTransport({
			installations: [buildGitHubInstallation()],
			repos: [
				{ id: 42, name: 'api', fullName: 'acme/api', owner: 'acme', private: true, defaultBranch: 'main', description: null },
				{ id: 43, name: 'web', fullName: 'acme/web', owner: 'acme', private: false, defaultBranch: 'main', description: 'frontend' },
			],
		});
	return { transportFactory: () => transport };
}

const REG = fakeRegistration({ provider: 'github', config: { app_id: '777', app_slug: 'meshify-app', app_client_id: 'Iv1.abc' }, secrets: { app_private_key: '-----BEGIN PRIVATE KEY-----k', app_webhook_secret: WEBHOOK_SECRET, app_client_secret: 'ghsecret' } });

const pushPayload = {
	ref: 'refs/heads/main',
	after: 'abc123',
	installation: { id: 12345 },
	repository: { id: 42, name: 'api', full_name: 'acme/api', default_branch: 'main', owner: { login: 'acme' } },
};

providerContractTests('github', () => ({
	provider: createGitHubProvider(deps()),
	fixtures: {
		integration: { provider: 'github', externalAccountId: '12345' },
		vault: fakeVaultHandle(),
		registration: fakeRegistration({ provider: 'github', config: { app_id: '777', app_slug: 'meshify-app', app_client_id: 'Iv1.abc' }, secrets: { app_private_key: '-----BEGIN PRIVATE KEY-----k', app_webhook_secret: WEBHOOK_SECRET, app_client_secret: 'ghsecret' } }),
		oauth: {
			validCallback: { params: { installation_id: '12345', setup_action: 'install', code: 'valid-code' } },
			invalidCallback: { params: { installation_id: '99999', code: 'valid-code' } },
			expectedExternalAccountId: '12345',
		},
		webhook: {
			validRequest: signedGitHubRequest('push', pushPayload),
			secret: WEBHOOK_SECRET,
			expectedEventType: 'push',
			expectedExternalAccountId: '12345',
			normalizeCases: [
				{ eventType: 'push', payload: pushPayload, expectedKinds: ['resource.updated'] },
				{ eventType: 'installation.deleted', payload: { installation: { id: 12345 } }, expectedKinds: ['connection.revoked'] },
				{
					eventType: 'installation_repositories.removed',
					payload: { repositories_added: [], repositories_removed: [{ id: 42 }] },
					expectedKinds: ['permission.changed'],
				},
			],
		},
		resources: { expectAtLeast: 2 },
	},
}));

describe('GitHubProvider specifics', () => {
	it('refuses to verify a callback whose installation is unknown to the app', async () => {
		const provider = createGitHubProvider(deps());
		await expect(provider.completeConnect({ params: { installation_id: '31337', code: 'valid-code' } }, REG)).rejects.toBeInstanceOf(ProviderAuthError);
	});

	it('rejects an installation the connecting user does not control (cross-org claim defense)', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation({ id: 12345 }), buildGitHubInstallation({ id: 999 })] });
		// The user can access installation 999 but NOT 12345 (another org's).
		transport.userInstallationIds = new Set(['999']);
		const provider = createGitHubProvider(deps({ transport }));
		await expect(provider.completeConnect({ params: { installation_id: '12345', code: 'valid-code' } }, REG)).rejects.toThrow(/do not have access/);
	});

	it('rejects a callback with no user-authorization code', async () => {
		const provider = createGitHubProvider(deps());
		await expect(provider.completeConnect({ params: { installation_id: '12345' } }, REG)).rejects.toThrow(/user authorization/);
	});

	it('rejects a bad/expired user code', async () => {
		const provider = createGitHubProvider(deps());
		await expect(provider.completeConnect({ params: { installation_id: '12345', code: 'stale' } }, REG)).rejects.toThrow(/could not be verified/);
	});

	it('502s connect when the registration lacks user-auth client credentials', async () => {
		const provider = createGitHubProvider(deps());
		const noClient = fakeRegistration({ provider: 'github', config: { app_id: '777', app_slug: 'meshify-app' }, secrets: { app_private_key: '-----BEGIN PRIVATE KEY-----k' } });
		await expect(provider.completeConnect({ params: { installation_id: '12345', code: 'valid-code' } }, noClient)).rejects.toThrow(/user authorization.*not configured/);
	});

	it('rejects suspended installations at connect time', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation({ suspendedAt: '2026-01-01T00:00:00Z' })] });
		const provider = createGitHubProvider(deps({ transport }));
		await expect(provider.completeConnect({ params: { installation_id: '12345', code: 'valid-code' } }, REG)).rejects.toThrow(/suspended/);
	});

	it('caches installation tokens in the vault — second call mints nothing', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation()] });
		const provider = createGitHubProvider(deps({ transport }));
		const ctx = { integration: buildIntegration({ externalAccountId: '12345' }), vault: fakeVaultHandle(), registration: REG };
		const first = await provider.getInstallationToken(ctx);
		const second = await provider.getInstallationToken(ctx);
		expect(second).toBe(first);
		expect(transport.tokensMinted).toBe(1);
	});

	it('re-mints when the cached token is inside the expiry margin', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation()] });
		const provider = createGitHubProvider(deps({ transport }));
		const vault = fakeVaultHandle({ installation_token: { value: 'ghs_stale', expiresAt: new Date(Date.now() + 60 * 1000) } });
		const token = await provider.getInstallationToken({ integration: buildIntegration({ externalAccountId: '12345' }), vault, registration: REG });
		expect(token).not.toBe('ghs_stale');
		expect(transport.tokensMinted).toBe(1);
	});

	it('ignores pushes to non-default branches', async () => {
		const provider = createGitHubProvider(deps());
		const ctx = { integration: buildIntegration({ externalAccountId: '12345' }), vault: fakeVaultHandle(), registration: REG };
		const events = await provider.normalizeWebhook(
			{ eventType: 'push', payload: { ...pushPayload, ref: 'refs/heads/feature-x' } },
			ctx
		);
		expect(events).toEqual([]);
	});

	it('builds the user-authorization URL from the OAuth client id (always issues a code, even when already installed)', () => {
		const provider = createGitHubProvider(deps());
		expect(provider.buildConnectUrl({ stateToken: 'tok/x', intent: 'connect' }, REG)).toBe(
			'https://github.com/login/oauth/authorize?client_id=Iv1.abc&state=tok%2Fx'
		);
	});

	it('derives the installation from the user when the callback omits installation_id (authorization flow)', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation({ id: 12345 })] });
		const provider = createGitHubProvider(deps({ transport }));
		const result = await provider.completeConnect({ params: { code: 'valid-code' } }, REG);
		expect(result.externalAccountId).toBe('12345');
	});

	it('throws ProviderNotConfiguredError when the registration lacks both client id and app slug', () => {
		const provider = createGitHubProvider(deps());
		const emptyReg = fakeRegistration({ provider: 'github', config: {} });
		expect(() => provider.buildConnectUrl({ stateToken: 't', intent: 'connect' }, emptyReg)).toThrow(ProviderNotConfiguredError);
	});

	it('maps installation state to health', async () => {
		const suspendedTransport = new FakeGitHubTransport({ installations: [buildGitHubInstallation({ suspendedAt: '2026-01-01T00:00:00Z' })] });
		const provider = createGitHubProvider(deps({ transport: suspendedTransport }));
		const ctx = { integration: buildIntegration({ externalAccountId: '12345' }), vault: fakeVaultHandle(), registration: REG };
		expect((await provider.checkHealth(ctx)).health).toBe('needs_reauthorization');

		const goneTransport = new FakeGitHubTransport();
		const goneProvider = createGitHubProvider(deps({ transport: goneTransport }));
		expect((await goneProvider.checkHealth(ctx)).health).toBe('disconnected');
	});
});
