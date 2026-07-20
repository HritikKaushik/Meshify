export type LlmProviderStatus = 'connected' | 'error' | 'disconnected';

/**
 * An organization's configuration for a single LLM provider. Holds only
 * metadata — the API key and other secrets live in the Credentials Vault
 * (`llm_provider_credentials`) and are never duplicated here. Part of the AI
 * Providers subsystem, deliberately separate from knowledge-source integrations.
 */
export interface LLMProviderConfiguration {
	id: string;
	orgId: string;
	/** The @meshify/ai provider id, e.g. "openai", "azure-openai". Registry-validated, not DB-constrained. */
	provider: string;
	status: LlmProviderStatus;
	/** The provider model RocketRide should run. Null until the org selects one. */
	defaultModel: string | null;
	/** Non-secret config (base_url, endpoint, api_version, deployment, server_url, …). */
	config: Record<string, unknown>;
	metadata: Record<string, unknown>;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
}
