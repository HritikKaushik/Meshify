import { describe, expect, it } from 'vitest';
import type { Integration } from '@meshify/data-access';
import type { Provider } from '../base/provider.js';
import { supportsByoa, supportsHealthCheck, supportsOAuth, supportsResourceBrowsing, supportsSync, supportsTools, supportsWebhooks } from '../base/provider.js';
import { validateManifest } from '../base/manifest.js';
import type { VaultHandle, IntegrationContext } from '../base/context.js';
import type { CallbackInput, ConnectInput } from '../base/oauth.js';
import type { RawWebhookRequest } from '../base/webhook.js';
import type { PlatformEventKind } from '../events/platform-events.js';
import { ProviderAuthError, ProviderConfigError } from '../base/errors.js';
import { buildIntegration, fakeVaultHandle } from './fakes.js';

/**
 * Everything the reusable contract suite needs to exercise one provider.
 * Fixtures cover only the capabilities the provider declares — a declared
 * capability without its fixture fails the suite (untested capability =
 * unproven capability).
 */
export interface ProviderContractFixtures {
	integration?: Partial<Integration>;
	/** Vault seeded with whatever tokens the provider's read paths need. */
	vault?: VaultHandle;
	oauth?: {
		connectInput?: Partial<ConnectInput>;
		/** Completes successfully against the provider's (fake) transport. */
		validCallback: CallbackInput;
		/** Must be rejected with ProviderAuthError. */
		invalidCallback: CallbackInput;
		expectedExternalAccountId: string;
	};
	webhook?: {
		/** A correctly signed request for `secret` (at `now`, for timestamped schemes). */
		validRequest: RawWebhookRequest;
		secret: string;
		now?: Date;
		expectedEventType: string;
		expectedExternalAccountId: string | null;
		/** A recorded payload → the platform-event kinds normalizeWebhook must emit. */
		normalizeCases?: Array<{ eventType: string; payload: Record<string, unknown>; expectedKinds: PlatformEventKind[] }>;
	};
	resources?: { expectAtLeast: number };
}

const CAPABILITY_GUARDS: Array<{ flag: (p: Provider) => boolean; guard: (p: Provider) => boolean; name: string }> = [
	{ name: 'oauth', flag: (p) => p.manifest.capabilities.oauth, guard: supportsOAuth },
	{ name: 'webhooks', flag: (p) => p.manifest.capabilities.webhooks, guard: supportsWebhooks },
	{ name: 'sync', flag: (p) => p.manifest.capabilities.fullSync || p.manifest.capabilities.incrementalSync, guard: supportsSync },
	{ name: 'healthCheck', flag: (p) => p.manifest.capabilities.healthCheck, guard: supportsHealthCheck },
	{ name: 'resourcePicker', flag: (p) => p.manifest.capabilities.resourcePicker, guard: supportsResourceBrowsing },
	{ name: 'byoa', flag: (p) => p.manifest.capabilities.byoa, guard: supportsByoa },
	{ name: 'tools', flag: (p) => p.manifest.capabilities.tools, guard: supportsTools },
];

/**
 * The acceptance gate for every provider: descriptor sanity, declared-vs-
 * implemented capability consistency, OAuth misuse handling, webhook
 * signature + dedup behavior, normalization output shape, health and
 * resource contracts. Run it from the provider's own test file:
 *
 *   providerContractTests('github', () => ({ provider: createGitHubProvider(fakeDeps), fixtures: {...} }));
 */
export function providerContractTests(name: string, setup: () => { provider: Provider; fixtures: ProviderContractFixtures }): void {
	describe(`provider contract: ${name}`, () => {
		function ctx(): { provider: Provider; fixtures: ProviderContractFixtures; ictx: IntegrationContext } {
			const { provider, fixtures } = setup();
			const integration = buildIntegration({ provider: provider.manifest.id, ...fixtures.integration });
			return { provider, fixtures, ictx: { integration, vault: fixtures.vault ?? fakeVaultHandle() } };
		}

		it('has a valid manifest', () => {
			const { provider } = ctx();
			expect(validateManifest(provider.manifest)).toEqual([]);
			expect(['available', 'coming_soon']).toContain(provider.manifest.availability);
		});

		it('tools: every declared tool has a name, description, and object input schema', () => {
			const { provider } = ctx();
			if (!supportsTools(provider)) return;
			const tools = provider.listTools();
			expect(tools.map((t) => t.name).sort()).toEqual([...(provider.manifest.toolNames ?? [])].sort());
			for (const tool of tools) {
				expect(tool.name).toMatch(/^[a-z][a-z0-9_-]*$/);
				expect(tool.description.length).toBeGreaterThan(0);
				expect(tool.inputSchema).toMatchObject({ type: 'object' });
			}
		});

		it('declares exactly the capabilities it implements', () => {
			const { provider } = ctx();
			for (const { name: capName, flag, guard } of CAPABILITY_GUARDS) {
				if (flag(provider)) {
					expect(guard(provider), `capability "${capName}" is declared but not implemented`).toBe(true);
				}
			}
		});

		it('provides fixtures for every declared capability', () => {
			const { provider, fixtures } = ctx();
			if (provider.manifest.capabilities.oauth) expect(fixtures.oauth, 'oauth fixtures required').toBeDefined();
			if (provider.manifest.capabilities.webhooks) expect(fixtures.webhook, 'webhook fixtures required').toBeDefined();
			if (provider.manifest.capabilities.resourcePicker) expect(fixtures.resources, 'resource fixtures required').toBeDefined();
		});

		it('oauth: builds an absolute connect URL carrying the state token', () => {
			const { provider, fixtures } = ctx();
			if (!supportsOAuth(provider) || !fixtures.oauth) return;
			const url = provider.buildConnectUrl({ stateToken: 'STATE-token_123', intent: 'connect', ...fixtures.oauth.connectInput });
			expect(url).toMatch(/^https:\/\//);
			expect(url).toContain(encodeURIComponent('STATE-token_123'));
		});

		it('oauth: completes a valid callback with verified identity and storable credentials', async () => {
			const { provider, fixtures } = ctx();
			if (!supportsOAuth(provider) || !fixtures.oauth) return;
			const result = await provider.completeConnect(fixtures.oauth.validCallback);
			expect(result.externalAccountId).toBe(fixtures.oauth.expectedExternalAccountId);
			expect(result.externalAccountName.length).toBeGreaterThan(0);
			for (const credential of result.credentials) {
				expect(credential.kind.length).toBeGreaterThan(0);
				expect(credential.value.length).toBeGreaterThan(0);
			}
		});

		it('oauth: rejects an unverifiable callback with ProviderAuthError', async () => {
			const { provider, fixtures } = ctx();
			if (!supportsOAuth(provider) || !fixtures.oauth) return;
			await expect(provider.completeConnect(fixtures.oauth.invalidCallback)).rejects.toBeInstanceOf(ProviderAuthError);
		});

		it('webhooks: accepts a correctly signed request and rejects tampering + wrong secrets', () => {
			const { provider, fixtures } = ctx();
			if (!supportsWebhooks(provider) || !fixtures.webhook) return;
			const { validRequest, secret, now } = fixtures.webhook;
			expect(provider.verifyWebhook(validRequest, secret, now)).toBe(true);
			const tampered = { ...validRequest, rawBody: Buffer.concat([validRequest.rawBody, Buffer.from(' ')]) };
			expect(provider.verifyWebhook(tampered, secret, now)).toBe(false);
			expect(provider.verifyWebhook(validRequest, `${secret}-wrong`, now)).toBe(false);
		});

		it('webhooks: describes deliveries stably (same request → same delivery id)', () => {
			const { provider, fixtures } = ctx();
			if (!supportsWebhooks(provider) || !fixtures.webhook) return;
			const first = provider.describeWebhook(fixtures.webhook.validRequest);
			const second = provider.describeWebhook(fixtures.webhook.validRequest);
			expect(first.kind).toBe('event');
			if (first.kind === 'event' && second.kind === 'event') {
				expect(second.deliveryId).toBe(first.deliveryId);
				expect(first.eventType).toBe(fixtures.webhook.expectedEventType);
				expect(first.externalAccountId).toBe(fixtures.webhook.expectedExternalAccountId);
			}
		});

		it('webhooks: normalizes payloads into platform events owned by this provider', async () => {
			const { provider, fixtures, ictx } = ctx();
			if (!supportsWebhooks(provider) || !fixtures.webhook?.normalizeCases) return;
			for (const testCase of fixtures.webhook.normalizeCases) {
				const events = await provider.normalizeWebhook({ eventType: testCase.eventType, payload: testCase.payload }, ictx);
				expect(events.map((e) => e.kind)).toEqual(testCase.expectedKinds);
				for (const platformEvent of events) {
					expect(platformEvent.provider).toBe(provider.manifest.id);
					expect(platformEvent.integrationId).toBe(ictx.integration.id);
					expect(platformEvent.orgId).toBe(ictx.integration.orgId);
				}
			}
		});

		it('health: reports a recognized health state', async () => {
			const { provider, ictx } = ctx();
			if (!supportsHealthCheck(provider)) return;
			const report = await provider.checkHealth(ictx);
			expect([
				'unknown',
				'healthy',
				'syncing',
				'token_expired',
				'permission_changed',
				'webhook_broken',
				'needs_reauthorization',
				'partially_connected',
				'disconnected',
			]).toContain(report.health);
		});

		it('resources: lists identifiable resources', async () => {
			const { provider, fixtures, ictx } = ctx();
			if (!supportsResourceBrowsing(provider) || !fixtures.resources) return;
			const page = await provider.listResources(ictx);
			expect(page.resources.length).toBeGreaterThanOrEqual(fixtures.resources.expectAtLeast);
			for (const resource of page.resources) {
				expect(resource.id.length).toBeGreaterThan(0);
				expect(resource.name.length).toBeGreaterThan(0);
				expect(resource.kind.length).toBeGreaterThan(0);
			}
		});

		it('byoa: describes its config form and rejects empty submissions', () => {
			const { provider } = ctx();
			if (!supportsByoa(provider)) return;
			const fields = provider.describeByoaConfig();
			expect(fields.length).toBeGreaterThan(0);
			for (const field of fields) {
				expect(field.key.length).toBeGreaterThan(0);
				expect(field.label.length).toBeGreaterThan(0);
			}
			expect(() => provider.validateByoaConfig({})).toThrow(ProviderConfigError);
		});
	});
}
