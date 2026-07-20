import type { LlmProviderRegistry } from '@meshify/ai';
import type { CredentialVault } from '@meshify/providers';
import type { ActiveLlmProviderRepository, LlmProviderConfigurationRepository } from '@meshify/data-access';
import { publicManifest, toConfigView, toFieldViews, toModelView } from './llm-provider-support.js';

/** Full detail for one provider: manifest, credential-field metadata (secrets masked), static models, and this org's config. */
export class GetLlmProviderUseCase {
	constructor(
		private readonly registry: LlmProviderRegistry,
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly active: ActiveLlmProviderRepository,
		private readonly vault: CredentialVault
	) {}

	async execute(command: { orgId: string; provider: string }) {
		const provider = this.registry.get(command.provider);
		const config = await this.configs.findByOrgAndProvider(command.orgId, command.provider);
		const active = await this.active.findByOrg(command.orgId);
		const isActive = config !== undefined && active?.configurationId === config.id;

		return {
			...publicManifest(provider.manifest),
			fields: await toFieldViews(this.vault, provider, config),
			models: toModelView(provider.defaultModels()),
			...toConfigView(config, isActive),
		};
	}
}
