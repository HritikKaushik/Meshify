import type { LlmProviderRegistry } from '@meshify/ai';
import type { CredentialVault } from '@meshify/providers';
import type { LlmProviderConfigurationRepository } from '@meshify/data-access';
import { buildEffectiveCredentials, toModelView } from './llm-provider-support.js';

/**
 * Returns a provider's selectable models. Static providers return their shipped
 * catalog (no credentials needed); dynamic providers (OpenRouter, Ollama) fetch
 * live using the org's stored credentials, falling back to the seed catalog when
 * none are stored yet.
 */
export class ListLlmModelsUseCase {
	constructor(
		private readonly registry: LlmProviderRegistry,
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly vault: CredentialVault
	) {}

	async execute(command: { orgId: string; provider: string }) {
		const provider = this.registry.get(command.provider);
		if (provider.manifest.modelSource === 'static') {
			return { models: toModelView(provider.defaultModels()) };
		}

		const config = await this.configs.findByOrgAndProvider(command.orgId, command.provider);
		if (!config) return { models: toModelView(provider.defaultModels()) };

		const { credentials } = await buildEffectiveCredentials(this.vault, provider, config, {});
		const models = await provider.listModels(credentials);
		return { models: toModelView(models) };
	}
}
