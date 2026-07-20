import type { ActiveLLMProvider } from './active-llm-provider.entity.js';

export interface ActiveLlmProviderRepository {
	/** Make a configuration the org's active provider (upsert — replaces any prior active). */
	setActive(orgId: string, configurationId: string): Promise<void>;
	findByOrg(orgId: string): Promise<ActiveLLMProvider | undefined>;
	clear(orgId: string): Promise<void>;
}
