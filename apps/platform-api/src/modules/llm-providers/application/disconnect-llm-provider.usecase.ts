import type { CredentialVault } from '@meshify/providers';
import type { LlmProviderConfigurationRepository } from '@meshify/data-access';
import type { LlmProviderChangeNotifier } from './llm-provider-change.port.js';
import { LlmProviderConfigNotFoundError } from './llm-provider-support.js';

/**
 * Removes an org's configuration for a provider: purges its vault secrets and
 * deletes the configuration row. The delete cascades to `active_llm_providers`
 * and `llm_provider_credentials`, so disconnecting the active provider clears
 * "active" automatically (chat falls back to the managed default).
 */
export class DisconnectLlmProviderUseCase {
	constructor(
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly vault: CredentialVault,
		private readonly notifier: LlmProviderChangeNotifier
	) {}

	async execute(command: { orgId: string; provider: string }) {
		const config = await this.configs.findByOrgAndProvider(command.orgId, command.provider);
		if (!config) throw new LlmProviderConfigNotFoundError(command.provider);
		await this.vault.purge(config.id);
		await this.configs.delete(command.orgId, command.provider);
		await this.notifier.notifyChanged(command.orgId);
	}
}
