// @meshify/ai — the AI Provider subsystem. A first-class platform layer parallel
// to (and independent of) the knowledge-source Integrations platform in
// @meshify/providers. Answers "which model runs inference", not "where does
// knowledge come from". Shares only the Credentials Vault primitive, wired at the
// composition root — this package has no dependency on @meshify/providers.

// Core contracts
export type { LlmProvider } from './provider-core/interfaces/llm-provider.js';
export type { LlmCapable, LlmCredentials, TestConnectionResult, ResolveNodeInput } from './provider-core/interfaces/llm-capability.js';
export type { LlmProviderManifest, LlmAuthType, LlmModelSource } from './provider-core/interfaces/llm-manifest.js';
export { AI_MANIFEST_VERSION, validateLlmManifest } from './provider-core/interfaces/llm-manifest.js';
export type { CredentialField } from './provider-core/interfaces/credential-field.js';
export type { ModelInfo } from './provider-core/interfaces/model.js';
export type { ResolvedRocketRideNode, RocketRideLlmComponent } from './provider-core/interfaces/rocketride-node.js';
export type { LlmHttpClient, LlmHttpResponse, LlmHttpRequestInit } from './provider-core/interfaces/transport.js';
export { defaultLlmHttpClient, withTimeout } from './provider-core/interfaces/transport.js';

// Errors
export {
	LlmProviderError,
	LlmAuthError,
	LlmRateLimitError,
	LlmQuotaError,
	LlmUnavailableError,
	LlmUnsupportedModelError,
	LlmTimeoutError,
	LlmConfigError,
	LlmProviderNotFoundError,
} from './provider-core/interfaces/errors.js';
export type { LlmErrorCode } from './provider-core/interfaces/errors.js';

// Registry
export { LlmProviderRegistry } from './provider-core/registry/llm-provider-registry.js';

// Providers + built-in registry factory
export { createBuiltInLlmRegistry } from './providers/index.js';
export type { LlmProviderDeps } from './providers/shared/deps.js';
export { createOpenAiProvider, OpenAiProvider, OPENAI_MANIFEST, OPENAI_MODELS } from './providers/openai/openai.provider.js';
export { createAnthropicProvider, AnthropicProvider, ANTHROPIC_MANIFEST, ANTHROPIC_MODELS } from './providers/anthropic/anthropic.provider.js';
export { createGeminiProvider, GeminiProvider, GEMINI_MANIFEST, GEMINI_MODELS } from './providers/gemini/gemini.provider.js';
export { createAzureOpenAiProvider, AzureOpenAiProvider, AZURE_OPENAI_MANIFEST } from './providers/azure-openai/azure-openai.provider.js';
export { createOpenRouterProvider, OpenRouterProvider, OPENROUTER_MANIFEST, OPENROUTER_SEED_MODELS } from './providers/openrouter/openrouter.provider.js';
export { createOllamaProvider, OllamaProvider, OLLAMA_MANIFEST } from './providers/ollama/ollama.provider.js';
