import type { LlmProviderRegistry } from '@meshify/ai';
import type { CredentialVault } from '@meshify/providers';
import type { LlmProviderConfigurationRepository } from '@meshify/data-access';
import type { LlmProviderChangeNotifier } from './llm-provider-change.port.js';
import { buildEffectiveCredentials, pickDefaultModel } from './llm-provider-support.js';

export interface ConnectLlmProviderCommand {
	orgId: string;
	provider: string;
	/** Submitted field values (secret + non-secret). Blank secrets keep the stored value (rotation). */
	values: Record<string, string>;
	defaultModel?: string;
}

/**
 * Saves an org's credentials + config for a provider. Secrets go to the
 * Credentials Vault (encrypted); non-secret config lands on the configuration
 * row. Structural validation happens before anything is persisted, so a bad
 * request never leaves a half-written config. Live validation is `test`.
 */
export class ConnectLlmProviderUseCase {
	constructor(
		private readonly registry: LlmProviderRegistry,
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly vault: CredentialVault,
		private readonly notifier: LlmProviderChangeNotifier
	) {}

	async execute(command: ConnectLlmProviderCommand) {
		const provider = this.registry.get(command.provider);
		const existing = await this.configs.findByOrgAndProvider(command.orgId, command.provider);

		const { credentials, secretUpdates, configUpdates } = await buildEffectiveCredentials(this.vault, provider, existing, command.values);
		// Throws a typed LlmProviderError (→ 400) before any write when required fields are missing/malformed.
		provider.validateCredentials(credentials);

		const defaultModel = pickDefaultModel(provider, command.defaultModel, existing);
		const config = await this.configs.upsert({
			orgId: command.orgId,
			provider: command.provider,
			status: 'connected',
			defaultModel,
			config: configUpdates,
		});

		for (const [kind, value] of Object.entries(secretUpdates)) {
			await this.vault.put(config.id, kind, value);
		}

		await this.notifier.notifyChanged(command.orgId);
		return { provider: command.provider, status: config.status, defaultModel: config.defaultModel };
	}
}
