import type { LLMProviderConfiguration, LlmProviderStatus } from './llm-provider-configuration.entity.js';

export interface UpsertLlmProviderConfigurationInput {
	orgId: string;
	provider: string;
	status?: LlmProviderStatus;
	defaultModel?: string | null;
	/** Non-secret config to merge into the existing config map. */
	config?: Record<string, unknown>;
}

export interface LlmProviderConfigurationRepository {
	/** Create or update the org's configuration for a provider (merges config). */
	upsert(input: UpsertLlmProviderConfigurationInput): Promise<LLMProviderConfiguration>;
	findByOrgAndProvider(orgId: string, provider: string): Promise<LLMProviderConfiguration | undefined>;
	findByIdForOrg(id: string, orgId: string): Promise<LLMProviderConfiguration | undefined>;
	/** The org's currently active configuration (joined via active_llm_providers), if any. */
	findActiveByOrg(orgId: string): Promise<LLMProviderConfiguration | undefined>;
	listByOrg(orgId: string): Promise<LLMProviderConfiguration[]>;
	updateStatus(id: string, status: LlmProviderStatus, lastError?: string | null): Promise<void>;
	updateDefaultModel(id: string, defaultModel: string | null): Promise<void>;
	delete(orgId: string, provider: string): Promise<void>;
}
