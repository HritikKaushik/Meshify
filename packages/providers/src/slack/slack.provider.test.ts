import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSlackProvider } from './slack.provider.js';
import type { SlackProviderDeps } from './deps.js';
import { providerContractTests } from '../testing/contract-tests.js';
import { FakeSlackTransport, buildIntegration, fakeVaultHandle } from '../testing/fakes.js';
import { ProviderAuthError, ProviderNotConfiguredError } from '../base/errors.js';
import type { RawWebhookRequest } from '../base/webhook.js';

const SIGNING_SECRET = 'slack-signing';
const NOW = new Date('2026-01-01T12:00:00.000Z');

function signedSlackRequest(payload: Record<string, unknown>, at: Date = NOW): RawWebhookRequest {
	const rawBody = Buffer.from(JSON.stringify(payload));
	const timestamp = String(Math.floor(at.getTime() / 1000));
	const signature = `v0=${createHmac('sha256', SIGNING_SECRET).update(`v0:${timestamp}:${rawBody.toString('utf8')}`).digest('hex')}`;
	return { rawBody, headers: { 'x-slack-signature': signature, 'x-slack-request-timestamp': timestamp } };
}

function deps(overrides: Partial<SlackProviderDeps> = {}): SlackProviderDeps {
	return {
		app: { clientId: 'cid', clientSecret: 'csecret', signingSecret: SIGNING_SECRET, redirectUri: 'https://app.example.com/oauth/slack/callback' },
		transport: new FakeSlackTransport(),
		now: () => NOW,
		...overrides,
	};
}

const messageEnvelope = {
	type: 'event_callback',
	event_id: 'Ev123',
	team_id: 'T111',
	event: { type: 'message', channel: 'C1', ts: '1735732800.000100', user: 'U1', text: 'hi' },
};

providerContractTests('slack', () => ({
	provider: createSlackProvider(deps()),
	fixtures: {
		integration: { provider: 'slack', externalAccountId: 'T111', metadata: { botUserId: 'U-bot' } },
		vault: fakeVaultHandle({ access_token: { value: 'xoxb-live' } }),
		oauth: {
			validCallback: { params: { code: 'valid-code' } },
			invalidCallback: { params: { error: 'access_denied' } },
			expectedExternalAccountId: 'T111',
		},
		webhook: {
			validRequest: signedSlackRequest(messageEnvelope),
			secret: SIGNING_SECRET,
			now: NOW,
			expectedEventType: 'message',
			expectedExternalAccountId: 'T111',
			normalizeCases: [
				{ eventType: 'message', payload: messageEnvelope, expectedKinds: ['content.changed'] },
				{ eventType: 'app_uninstalled', payload: { type: 'event_callback', team_id: 'T111', event: { type: 'app_uninstalled' } }, expectedKinds: ['connection.revoked'] },
			],
		},
		resources: { expectAtLeast: 1 },
	},
}));

describe('SlackProvider specifics', () => {
	it('answers the url_verification handshake with the challenge', () => {
		const provider = createSlackProvider(deps());
		const req = signedSlackRequest({ type: 'url_verification', challenge: 'chal-42' });
		const described = provider.describeWebhook(req);
		expect(described).toEqual({ kind: 'challenge', response: JSON.stringify({ challenge: 'chal-42' }) });
	});

	it('rejects deliveries outside the 5-minute replay window', () => {
		const provider = createSlackProvider(deps());
		const stale = signedSlackRequest(messageEnvelope, new Date(NOW.getTime() - 6 * 60 * 1000));
		expect(provider.verifyWebhook(stale, SIGNING_SECRET, NOW)).toBe(false);
		const fresh = signedSlackRequest(messageEnvelope, new Date(NOW.getTime() - 4 * 60 * 1000));
		expect(provider.verifyWebhook(fresh, SIGNING_SECRET, NOW)).toBe(true);
	});

	it('captures rotation credentials when Slack issues them', async () => {
		const transport = new FakeSlackTransport({
			exchangeResult: {
				accessToken: 'xoxe-access',
				teamId: 'T111',
				teamName: 'Acme',
				botUserId: 'U-bot',
				scope: 'channels:read',
				refreshToken: 'xoxe-refresh',
				expiresInSeconds: 43200,
				appId: 'A111',
			},
		});
		const provider = createSlackProvider(deps({ transport }));
		const result = await provider.completeConnect({ params: { code: 'valid-code' } });
		expect(result.credentials).toEqual([
			{ kind: 'access_token', value: 'xoxe-access', expiresAt: new Date(NOW.getTime() + 43200 * 1000) },
			{ kind: 'refresh_token', value: 'xoxe-refresh', expiresAt: null },
		]);
	});

	it('refreshCredentials is a no-op without a refresh token and rotates with one', async () => {
		const transport = new FakeSlackTransport();
		const provider = createSlackProvider(deps({ transport }));
		const integration = buildIntegration({ provider: 'slack', externalAccountId: 'T111' });

		expect(await provider.refreshCredentials({ integration, vault: fakeVaultHandle() })).toBeNull();

		const rotated = await provider.refreshCredentials({ integration, vault: fakeVaultHandle({ refresh_token: { value: 'xoxe-old' } }) });
		expect(rotated?.credentials.map((c) => c.kind)).toEqual(['access_token', 'refresh_token']);
		expect(transport.refreshCalls).toBe(1);
	});

	it('revokes the stored token on disconnect (best-effort)', async () => {
		const transport = new FakeSlackTransport();
		const provider = createSlackProvider(deps({ transport }));
		const integration = buildIntegration({ provider: 'slack', externalAccountId: 'T111' });
		await provider.revokeAccess({ integration, vault: fakeVaultHandle({ access_token: { value: 'xoxb-live' } }) });
		expect(transport.revoked).toEqual(['xoxb-live']);
	});

	it('treats only the bot joining a channel as a grant change', async () => {
		const provider = createSlackProvider(deps());
		const integration = buildIntegration({ provider: 'slack', externalAccountId: 'T111', metadata: { botUserId: 'U-bot' } });
		const ctx = { integration, vault: fakeVaultHandle() };
		const botJoin = await provider.normalizeWebhook(
			{ eventType: 'member_joined_channel', payload: { event: { type: 'member_joined_channel', user: 'U-bot', channel: 'C9' } } },
			ctx
		);
		expect(botJoin).toEqual([{ provider: 'slack', integrationId: 'int-1', orgId: 'org-1', kind: 'permission.changed', added: ['C9'], removed: [] }]);
		const humanJoin = await provider.normalizeWebhook(
			{ eventType: 'member_joined_channel', payload: { event: { type: 'member_joined_channel', user: 'U-human', channel: 'C9' } } },
			ctx
		);
		expect(humanJoin).toEqual([]);
	});

	it('maps token state to health', async () => {
		const provider = createSlackProvider(deps());
		const integration = buildIntegration({ provider: 'slack', externalAccountId: 'T111' });
		expect((await provider.checkHealth({ integration, vault: fakeVaultHandle() })).health).toBe('needs_reauthorization');
		expect(
			(await provider.checkHealth({ integration, vault: fakeVaultHandle({ refresh_token: { value: 'xoxe' } }) })).health
		).toBe('token_expired');

		const failing = createSlackProvider(deps({ transport: new FakeSlackTransport({ authTestFails: 'invalid_auth' }) }));
		expect(
			(await failing.checkHealth({ integration, vault: fakeVaultHandle({ access_token: { value: 'xoxb-dead' } }) })).health
		).toBe('needs_reauthorization');
	});

	it('rejects a callback missing its code with ProviderAuthError and 503s when unconfigured', async () => {
		const provider = createSlackProvider(deps());
		await expect(provider.completeConnect({ params: {} })).rejects.toBeInstanceOf(ProviderAuthError);
		const unconfigured = createSlackProvider({ app: null, transport: null });
		expect(unconfigured.isConfigured()).toBe(false);
		expect(() => unconfigured.buildConnectUrl({ stateToken: 't', intent: 'connect' })).toThrow(ProviderNotConfiguredError);
	});
});
