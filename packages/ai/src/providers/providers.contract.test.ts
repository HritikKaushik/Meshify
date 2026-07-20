import { describe, it, expect } from 'vitest';
import { llmProviderContractTests } from '../testing/contract-tests.js';
import { fakeHttpClient, makeClock } from '../testing/fakes.js';
import { createOpenAiProvider } from './openai/openai.provider.js';
import { createAnthropicProvider } from './anthropic/anthropic.provider.js';
import { createGeminiProvider } from './gemini/gemini.provider.js';
import { createAzureOpenAiProvider } from './azure-openai/azure-openai.provider.js';
import { createOpenRouterProvider } from './openrouter/openrouter.provider.js';
import { createOllamaProvider } from './ollama/ollama.provider.js';
import { createBuiltInLlmRegistry } from './index.js';

const apiKeyCreds = { secrets: { api_key: 'test-key' }, config: {} };

llmProviderContractTests('openai', createOpenAiProvider, {
	sampleCredentials: apiKeyCreds,
	sampleModel: 'gpt-4.1',
	healthyModelsResponse: { body: { data: [{ id: 'gpt-4.1' }, { id: 'gpt-4o' }] } },
	expectedComponent: 'llm_openai',
});

llmProviderContractTests('anthropic', createAnthropicProvider, {
	sampleCredentials: apiKeyCreds,
	sampleModel: 'claude-sonnet-4',
	healthyModelsResponse: { body: { data: [{ id: 'claude-sonnet-4' }] } },
	expectedComponent: 'llm_anthropic',
});

llmProviderContractTests('gemini', createGeminiProvider, {
	sampleCredentials: apiKeyCreds,
	sampleModel: 'gemini-2.5-pro',
	healthyModelsResponse: {
		body: { models: [{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1_048_576 }] },
	},
	expectedComponent: 'llm_gemini',
});

llmProviderContractTests('azure-openai', createAzureOpenAiProvider, {
	sampleCredentials: { secrets: { api_key: 'test-key' }, config: { endpoint: 'https://acme.openai.azure.com', api_version: '2024-10-21', deployment: 'gpt-4o' } },
	sampleModel: 'gpt-4o',
	healthyModelsResponse: { body: { data: [{ id: 'gpt-4o' }] } },
	expectedComponent: 'llm_openai_api',
});

llmProviderContractTests('openrouter', createOpenRouterProvider, {
	sampleCredentials: apiKeyCreds,
	sampleModel: 'anthropic/claude-sonnet-4',
	healthyModelsResponse: { body: { data: [{ id: 'anthropic/claude-sonnet-4', context_length: 200_000 }] } },
	expectedComponent: 'llm_openai_api',
});

llmProviderContractTests('ollama', createOllamaProvider, {
	sampleCredentials: { secrets: {}, config: {} },
	sampleModel: 'llama3.1:8b',
	healthyModelsResponse: { body: { models: [{ name: 'llama3.1:8b' }] } },
	expectedComponent: 'llm_ollama',
});

describe('provider-specific RocketRide node resolution', () => {
	it('OpenRouter injects a literal base_url and api key', () => {
		const node = createOpenRouterProvider().resolveRocketRideNode({ model: 'openai/gpt-4.1', credentials: apiKeyCreds });
		expect(node.baseUrl).toBe('https://openrouter.ai/api/v1');
		expect(node.apikey).toBe('test-key');
	});

	it('Ollama is keyless and points serverbase at /v1', () => {
		const node = createOllamaProvider().resolveRocketRideNode({
			model: 'llama3.1:8b',
			credentials: { secrets: {}, config: { server_url: 'http://ollama.internal:11434' } },
		});
		expect(node.apikey).toBeUndefined();
		expect(node.baseUrl).toBe('http://ollama.internal:11434/v1');
		expect(node.extra).toMatchObject({ temperature: expect.any(Number), reasoning_effort: expect.any(String) });
	});

	it('Azure builds a deployment-scoped base_url', () => {
		const node = createAzureOpenAiProvider().resolveRocketRideNode({
			model: 'gpt-4o',
			credentials: { secrets: { api_key: 'k' }, config: { endpoint: 'https://acme.openai.azure.com/', api_version: '2024-10-21', deployment: 'gpt-4o' } },
		});
		expect(node.baseUrl).toBe('https://acme.openai.azure.com/openai/deployments/gpt-4o');
	});

	it('Gemini carries outputTokens in extra', () => {
		const node = createGeminiProvider().resolveRocketRideNode({ model: 'gemini-2.5-pro', credentials: apiKeyCreds });
		expect(node.extra).toMatchObject({ outputTokens: expect.any(Number) });
	});

	it('caps modelTotalTokens to RocketRide budget — a million-token context must not be forwarded raw', () => {
		// gpt-4.1 has a ~1M context window; RocketRide would reject that as modelTotalTokens.
		const node = createOpenAiProvider().resolveRocketRideNode({ model: 'gpt-4.1', credentials: apiKeyCreds });
		expect(node.modelTotalTokens).toBe(16384);
		expect(node.modelTotalTokens).toBeLessThanOrEqual(16384);
	});
});

describe('createBuiltInLlmRegistry', () => {
	it('registers all six providers with faked transport', () => {
		const { client } = fakeHttpClient(() => ({ body: { data: [] } }));
		const registry = createBuiltInLlmRegistry({ http: client, now: makeClock() });
		expect(registry.manifests().map((m) => m.id).sort()).toEqual(
			['anthropic', 'azure-openai', 'gemini', 'ollama', 'openai', 'openrouter']
		);
	});
});
