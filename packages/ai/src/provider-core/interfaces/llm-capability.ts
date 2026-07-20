import type { ModelInfo } from './model.js';
import type { ResolvedRocketRideNode } from './rocketride-node.js';

/**
 * Credentials + non-secret config as resolved for a single org's provider
 * configuration. Secrets come decrypted from the Credentials Vault; config comes
 * from the configuration row. Adapters never touch the vault or the database —
 * the platform-api resolution layer hands them plain values.
 */
export interface LlmCredentials {
	/** Decrypted secret values by field key, e.g. { api_key: "sk-..." }. */
	secrets: Record<string, string>;
	/** Non-secret config by key, e.g. { endpoint, api_version, deployment, base_url, server_url }. */
	config: Record<string, string>;
}

/** Result of a live connection test. Never throws — errors are captured in `error`. */
export interface TestConnectionResult {
	ok: boolean;
	/** Models discovered during the test (when the provider exposes a list endpoint). */
	models?: ModelInfo[];
	latencyMs?: number;
	/** Deployment region, when the provider reports one (e.g. Azure). */
	region?: string;
	/** Human-actionable error message when `ok` is false. */
	error?: string;
	/** Machine code from `LlmErrorCode` when `ok` is false. */
	errorCode?: string;
}

export interface ResolveNodeInput {
	/** The selected default model id. */
	model: string;
	credentials: LlmCredentials;
}

/**
 * The common adapter interface every LLM provider implements. Eliminates
 * provider-specific branching everywhere else: callers resolve a provider from
 * the registry and invoke these methods, never `if (id === 'openai')`.
 */
export interface LlmCapable {
	/**
	 * Cheap structural validation of credentials/config (required fields present,
	 * well-formed). Throws a typed `LlmProviderError` on failure. Does not call
	 * the network — that is `testConnection`.
	 */
	validateCredentials(credentials: LlmCredentials): void;

	/**
	 * Live call to the provider: authenticates, and where possible lists models
	 * and measures latency/region. Never throws — failures are returned in the
	 * result so the UI can render actionable errors.
	 */
	testConnection(credentials: LlmCredentials, opts?: { model?: string }): Promise<TestConnectionResult>;

	/**
	 * Available models. Static providers return their shipped catalog; dynamic
	 * providers (OpenRouter, Ollama) fetch from the provider. May throw a typed
	 * `LlmProviderError` for dynamic providers on network/auth failure.
	 */
	listModels(credentials: LlmCredentials): Promise<ModelInfo[]>;

	/**
	 * Produces the vendor-blind RocketRide node for the chat/completion pipeline.
	 * Pure — no network — so it is safe on the chat hot path.
	 */
	resolveRocketRideNode(input: ResolveNodeInput): ResolvedRocketRideNode;
}
