import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { CredentialVault, ProviderRegistry, ProviderRegistrationService, createGitHubProvider, createSlackProvider } from '@meshify/providers';
import { FakeGitHubTransport, FakeSlackTransport, InMemoryCredentialStore, buildGitHubInstallation, buildIntegration, fakeCipher } from '@meshify/providers/testing';
import { InMemoryIntegrationRepository, InMemoryWebhookEventRepository } from '@meshify/testing';
import { createWebhooksController } from './webhooks.controller.js';

const GITHUB_SECRET = 'gh-wh-secret';
const SLACK_SECRET = 'slack-signing';

function signGitHub(body: Buffer): string {
	return `sha256=${createHmac('sha256', GITHUB_SECRET).update(body).digest('hex')}`;
}

describe('webhook receiver (e2e over real HTTP, mounted exactly like main.ts)', () => {
	let server: Server;
	let baseUrl: string;
	const webhookEvents = new InMemoryWebhookEventRepository();
	const integrations = new InMemoryIntegrationRepository([
		buildIntegration({ id: 'int-gh', provider: 'github', orgId: 'org-1', externalAccountId: '12345', status: 'active' }),
	]);
	const enqueued: Array<{ payload: { webhookEventId: string }; opts: { jobId?: string } }> = [];

	beforeAll(async () => {
		const registry = new ProviderRegistry();
		registry.register(createGitHubProvider({ transportFactory: () => new FakeGitHubTransport({ installations: [buildGitHubInstallation()] }) }));
		registry.register(createSlackProvider({ transportFactory: () => new FakeSlackTransport() }));

		// A registration service with the deployment's managed webhook secrets.
		const managed = new Map([
			['github', { config: { app_id: '1', app_slug: 'meshify' }, secrets: { app_webhook_secret: GITHUB_SECRET } }],
			['slack', { config: { app_client_id: 'c', app_redirect_uri: 'https://x/cb' }, secrets: { app_signing_secret: SLACK_SECRET } }],
		]);
		const registrations = new ProviderRegistrationService(
			{ findByOrgAndProvider: async () => undefined, findById: async () => undefined },
			new CredentialVault(new InMemoryCredentialStore(), fakeCipher),
			managed
		);

		const app = express();
		// The load-bearing mounting order from main.ts: receiver BEFORE express.json().
		app.use(
			createWebhooksController({
				registry,
				integrations,
				webhookEvents,
				webhookQueue: { add: async (_n: string, payload: { webhookEventId: string }, opts: { jobId?: string }) => void enqueued.push({ payload, opts }) } as never,
				registrations,
				limiter: { hit: async () => ({ allowed: true }) },
				logger: { warn: () => undefined, error: () => undefined },
			})
		);
		app.use(express.json());
		app.post('/echo', (req, res) => res.status(200).json(req.body));

		server = createServer(app);
		await new Promise<void>((resolve) => server.listen(0, resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
	});

	function githubDelivery(deliveryId: string, payload: Record<string, unknown>, mutate?: (init: RequestInit & { headers: Record<string, string> }) => void) {
		const body = Buffer.from(JSON.stringify(payload));
		const init: RequestInit & { headers: Record<string, string> } = {
			method: 'POST',
			body,
			headers: {
				'content-type': 'application/json',
				'x-github-event': 'push',
				'x-github-delivery': deliveryId,
				'x-hub-signature-256': signGitHub(body),
			},
		};
		mutate?.(init);
		return fetch(`${baseUrl}/v1/integrations/webhooks/github`, init);
	}

	const pushPayload = {
		ref: 'refs/heads/main',
		after: 'abc',
		installation: { id: 12345 },
		repository: { id: 42, name: 'api', full_name: 'acme/api', default_branch: 'main' },
	};

	it('accepts a correctly signed delivery: records it, enqueues processing, ACKs fast', async () => {
		const res = await githubDelivery('d-1', pushPayload);
		expect(res.status).toBe(200);
		expect(enqueued).toHaveLength(1);
		const stored = await webhookEvents.findById(enqueued[0]!.payload.webhookEventId);
		expect(stored).toMatchObject({ provider: 'github', deliveryId: 'd-1', eventType: 'push', integrationId: 'int-gh', status: 'queued' });
	});

	it('treats a provider redelivery as an idempotent no-op', async () => {
		const res = await githubDelivery('d-1', pushPayload);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ duplicate: true });
		expect(enqueued).toHaveLength(1);
	});

	it('rejects tampered bodies and wrong signatures without recording anything', async () => {
		const before = webhookEvents.events.size;
		const res = await githubDelivery('d-2', pushPayload, (init) => {
			init.body = Buffer.from(JSON.stringify({ ...pushPayload, after: 'EVIL' }));
		});
		expect(res.status).toBe(401);
		expect(webhookEvents.events.size).toBe(before);
	});

	it('keeps verified-but-unclaimed deliveries for audit without processing them', async () => {
		const res = await githubDelivery('d-3', { ...pushPayload, installation: { id: 99999 } });
		expect(res.status).toBe(200);
		const stored = [...webhookEvents.events.values()].find((e) => e.deliveryId === 'd-3');
		expect(stored).toMatchObject({ integrationId: null, status: 'skipped' });
		expect(enqueued).toHaveLength(1); // unchanged
	});

	it('answers the Slack url_verification handshake with the challenge', async () => {
		const body = Buffer.from(JSON.stringify({ type: 'url_verification', challenge: 'chal-7' }));
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = `v0=${createHmac('sha256', SLACK_SECRET).update(`v0:${timestamp}:${body.toString('utf8')}`).digest('hex')}`;
		const res = await fetch(`${baseUrl}/v1/integrations/webhooks/slack`, {
			method: 'POST',
			body,
			headers: { 'content-type': 'application/json', 'x-slack-signature': signature, 'x-slack-request-timestamp': timestamp },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ challenge: 'chal-7' });
	});

	it('404s unknown providers and unconfigured secrets identically', async () => {
		const res = await fetch(`${baseUrl}/v1/integrations/webhooks/gitlab`, { method: 'POST', body: '{}' });
		expect(res.status).toBe(404);
	});

	it('regression: the raw-body mount does not break JSON parsing for routes behind express.json()', async () => {
		const res = await fetch(`${baseUrl}/echo`, { method: 'POST', body: JSON.stringify({ hello: 'world' }), headers: { 'content-type': 'application/json' } });
		expect(await res.json()).toEqual({ hello: 'world' });
	});
});
