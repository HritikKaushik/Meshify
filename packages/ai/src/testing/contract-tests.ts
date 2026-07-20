import { describe, it, expect } from 'vitest';
import type { LlmProvider } from '../provider-core/interfaces/llm-provider.js';
import type { LlmCredentials } from '../provider-core/interfaces/llm-capability.js';
import type { LlmProviderDeps } from '../providers/shared/deps.js';
import { LlmProviderRegistry } from '../provider-core/registry/llm-provider-registry.js';
import { validateLlmManifest } from '../provider-core/interfaces/llm-manifest.js';
import { fakeHttpClient, makeClock, type FakeResponse } from './fakes.js';

export interface ContractOptions {
	/** Valid sample credentials for this provider. */
	sampleCredentials: LlmCredentials;
	/** A model id this provider accepts. */
	sampleModel: string;
	/** The healthy response body/shape this provider's list endpoint returns. */
	healthyModelsResponse: FakeResponse;
	/** Expected RocketRide component id. */
	expectedComponent: string;
}

/**
 * The acceptance gate every AI provider must pass — the LLM counterpart of
 * `providerContractTests` in `@meshify/providers/testing`. Asserts manifest
 * validity, registry acceptance, credential validation, RocketRide node
 * resolution, and that `testConnection` never throws (success + auth-failure).
 */
export function llmProviderContractTests(
	name: string,
	makeProvider: (deps?: LlmProviderDeps) => LlmProvider,
	options: ContractOptions
): void {
	describe(`LLM provider contract: ${name}`, () => {
		it('exposes a valid manifest', () => {
			expect(validateLlmManifest(makeProvider().manifest)).toEqual([]);
		});

		it('registers in a registry without error and is retrievable', () => {
			const registry = new LlmProviderRegistry();
			const provider = makeProvider();
			expect(() => registry.register(provider)).not.toThrow();
			expect(registry.get(provider.manifest.id)).toBe(provider);
		});

		it('accepts valid credentials', () => {
			expect(() => makeProvider().validateCredentials(options.sampleCredentials)).not.toThrow();
		});

		it('resolves a vendor-blind RocketRide node', () => {
			const node = makeProvider().resolveRocketRideNode({
				model: options.sampleModel,
				credentials: options.sampleCredentials,
			});
			expect(node.component).toBe(options.expectedComponent);
			expect(node.model).toBe(options.sampleModel);
			expect(node.modelTotalTokens).toBeGreaterThan(0);
		});

		it('testConnection succeeds against a healthy provider (and never throws)', async () => {
			const { client } = fakeHttpClient(() => options.healthyModelsResponse);
			const result = await makeProvider({ http: client, now: makeClock() }).testConnection(options.sampleCredentials);
			expect(result.ok).toBe(true);
			expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		});

		it('testConnection reports auth failure as a typed error (never throws)', async () => {
			const { client } = fakeHttpClient(() => ({ status: 401, text: 'unauthorized' }));
			const result = await makeProvider({ http: client, now: makeClock() }).testConnection(options.sampleCredentials);
			expect(result.ok).toBe(false);
			expect(result.errorCode).toBe('invalid_credentials');
		});
	});
}
