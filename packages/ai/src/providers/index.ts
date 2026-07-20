import { LlmProviderRegistry } from '../provider-core/registry/llm-provider-registry.js';
import { createOpenAiProvider } from './openai/openai.provider.js';
import { createAnthropicProvider } from './anthropic/anthropic.provider.js';
import { createGeminiProvider } from './gemini/gemini.provider.js';
import { createAzureOpenAiProvider } from './azure-openai/azure-openai.provider.js';
import { createOpenRouterProvider } from './openrouter/openrouter.provider.js';
import { createOllamaProvider } from './ollama/ollama.provider.js';
import type { LlmProviderDeps } from './shared/deps.js';

/**
 * Registers every built-in AI provider in a fresh registry. This is the ONE
 * place a new provider is added to the platform — the marketplace, detail UI,
 * connect/test/activate flow, and RocketRide resolution all read from the
 * registry, so no other code changes. Composition roots call this.
 */
export function createBuiltInLlmRegistry(deps?: LlmProviderDeps): LlmProviderRegistry {
	const registry = new LlmProviderRegistry();
	registry.register(createOpenAiProvider(deps));
	registry.register(createAnthropicProvider(deps));
	registry.register(createGeminiProvider(deps));
	registry.register(createAzureOpenAiProvider(deps));
	registry.register(createOpenRouterProvider(deps));
	registry.register(createOllamaProvider(deps));
	return registry;
}
