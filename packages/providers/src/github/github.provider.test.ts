import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGitHubProvider } from './github.provider.js';
import type { GitHubProviderDeps } from './deps.js';
import { providerContractTests } from '../testing/contract-tests.js';
import { FakeGitHubTransport, buildGitHubInstallation, buildIntegration, fakeVaultHandle } from '../testing/fakes.js';
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

function deps(overrides: Partial<GitHubProviderDeps> = {}): GitHubProviderDeps {
	return {
		app: { appId: '777', privateKey: 'pem', slug: 'meshify-app', webhookSecret: WEBHOOK_SECRET },
		transport: new FakeGitHubTransport({
			installations: [buildGitHubInstallation()],
			repos: [
				{ id: 42, name: 'api', fullName: 'acme/api', owner: 'acme', private: true, defaultBranch: 'main', description: null },
				{ id: 43, name: 'web', fullName: 'acme/web', owner: 'acme', private: false, defaultBranch: 'main', description: 'frontend' },
			],
		}),
		...overrides,
	};
}

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
		oauth: {
			validCallback: { params: { installation_id: '12345', setup_action: 'install' } },
			invalidCallback: { params: { installation_id: '99999' } },
			expectedExternalAccountId: '12345',
		},
		webhook: {
			validRequest: signedGitHubRequest('push', pushPayload),
			secret: WEBHOOK_SECRET,
			expectedEventType: 'push',
			expectedExternalAccountId: '12345',
			normalizeCases: [
				{ eventType: 'push', payload: pushPayload, expectedKinds: ['resource.updated'] },
				{ eventType: 'installation.deleted', payload: { installation: { id: 12345 } }, expectedKinds: ['installation.revoked'] },
				{
					eventType: 'installation_repositories.removed',
					payload: { repositories_added: [], repositories_removed: [{ id: 42 }] },
					expectedKinds: ['grant.changed'],
				},
			],
		},
		resources: { expectAtLeast: 2 },
	},
}));

describe('GitHubProvider specifics', () => {
	it('refuses to verify a callback whose installation is unknown to the app', async () => {
		const provider = createGitHubProvider(deps());
		await expect(provider.completeConnect({ params: { installation_id: '31337' } })).rejects.toBeInstanceOf(ProviderAuthError);
	});

	it('rejects suspended installations at connect time', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation({ suspendedAt: '2026-01-01T00:00:00Z' })] });
		const provider = createGitHubProvider(deps({ transport }));
		await expect(provider.completeConnect({ params: { installation_id: '12345' } })).rejects.toThrow(/suspended/);
	});

	it('caches installation tokens in the vault — second call mints nothing', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation()] });
		const provider = createGitHubProvider(deps({ transport }));
		const ctx = { integration: buildIntegration({ externalAccountId: '12345' }), vault: fakeVaultHandle() };
		const first = await provider.getInstallationToken(ctx);
		const second = await provider.getInstallationToken(ctx);
		expect(second).toBe(first);
		expect(transport.tokensMinted).toBe(1);
	});

	it('re-mints when the cached token is inside the expiry margin', async () => {
		const transport = new FakeGitHubTransport({ installations: [buildGitHubInstallation()] });
		const provider = createGitHubProvider(deps({ transport }));
		const vault = fakeVaultHandle({ installation_token: { value: 'ghs_stale', expiresAt: new Date(Date.now() + 60 * 1000) } });
		const token = await provider.getInstallationToken({ integration: buildIntegration({ externalAccountId: '12345' }), vault });
		expect(token).not.toBe('ghs_stale');
		expect(transport.tokensMinted).toBe(1);
	});

	it('ignores pushes to non-default branches', async () => {
		const provider = createGitHubProvider(deps());
		const ctx = { integration: buildIntegration({ externalAccountId: '12345' }), vault: fakeVaultHandle() };
		const events = await provider.normalizeWebhook(
			{ eventType: 'push', payload: { ...pushPayload, ref: 'refs/heads/feature-x' } },
			ctx
		);
		expect(events).toEqual([]);
	});

	it('builds the installations/new URL from the app slug', () => {
		const provider = createGitHubProvider(deps());
		expect(provider.buildConnectUrl({ stateToken: 'tok/x', intent: 'connect' })).toBe(
			'https://github.com/apps/meshify-app/installations/new?state=tok%2Fx'
		);
	});

	it('throws ProviderNotConfiguredError when no managed app is configured', () => {
		const provider = createGitHubProvider({ app: null, transport: null });
		expect(provider.isConfigured()).toBe(false);
		expect(() => provider.buildConnectUrl({ stateToken: 't', intent: 'connect' })).toThrow(ProviderNotConfiguredError);
	});

	it('maps installation state to health', async () => {
		const suspendedTransport = new FakeGitHubTransport({ installations: [buildGitHubInstallation({ suspendedAt: '2026-01-01T00:00:00Z' })] });
		const provider = createGitHubProvider(deps({ transport: suspendedTransport }));
		const ctx = { integration: buildIntegration({ externalAccountId: '12345' }), vault: fakeVaultHandle() };
		expect((await provider.checkHealth(ctx)).health).toBe('needs_reauthorization');

		const goneTransport = new FakeGitHubTransport();
		const goneProvider = createGitHubProvider(deps({ transport: goneTransport }));
		expect((await goneProvider.checkHealth(ctx)).health).toBe('disconnected');
	});
});
