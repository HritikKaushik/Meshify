import type { LlmProviderRegistry } from '@meshify/ai';
import type { ActiveLlmProviderRepository, LlmProviderConfigurationRepository } from '@meshify/data-access';
import { publicManifest } from './llm-provider-support.js';

/**
 * The AI Models marketplace catalog: every registered provider merged with this
 * org's configuration + active state. Answers "which providers exist and which is
 * active", the data the AI Models cards render from.
 */
export class ListLlmProvidersUseCase {
	constructor(
		private readonly registry: LlmProviderRegistry,
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly active: ActiveLlmProviderRepository
	) {}

	async execute(orgId: string) {
		const configs = await this.configs.listByOrg(orgId);
		const active = await this.active.findByOrg(orgId);
		const byProvider = new Map(configs.map((config) => [config.provider, config]));

		return this.registry.list().map((provider) => {
			const config = byProvider.get(provider.manifest.id);
			return {
				...publicManifest(provider.manifest),
				status: config?.status ?? 'not_connected',
				defaultModel: config?.defaultModel ?? null,
				configured: config !== undefined,
				active: config !== undefined && active?.configurationId === config.id,
				lastError: config?.lastError ?? null,
			};
		});
	}
}
