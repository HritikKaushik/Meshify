import type { LlmProviderRegistry } from '@meshify/ai';
import type { CredentialVault } from '@meshify/providers';
import type { ActiveLlmProviderRepository, LlmProviderConfigurationRepository } from '@meshify/data-access';
import type { LlmProviderChangeNotifier } from './llm-provider-change.port.js';
import { buildEffectiveCredentials, LlmProviderConfigNotFoundError, LlmProviderValidationError } from './llm-provider-support.js';

/**
 * Makes a provider the org's single active provider. Validates it is connected,
 * has a default model, and still has resolvable credentials; persists the
 * selection (org_id PK guarantees exactly one active); then notifies so the
 * resolution + chat-pipeline caches invalidate and the next chat turn uses it.
 */
export class ActivateLlmProviderUseCase {
	constructor(
		private readonly registry: LlmProviderRegistry,
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly active: ActiveLlmProviderRepository,
		private readonly vault: CredentialVault,
		private readonly notifier: LlmProviderChangeNotifier
	) {}

	async execute(command: { orgId: string; provider: string; projectId?: string }) {
		const provider = this.registry.get(command.provider);
		const config = await this.configs.findByOrgAndProvider(command.orgId, command.provider);
		if (!config) throw new LlmProviderConfigNotFoundError(command.provider);
		if (config.status === 'disconnected') throw new LlmProviderValidationError('Connect the provider before activating it.');
		if (!config.defaultModel) throw new LlmProviderValidationError('Select a default model before activating this provider.');

		const { credentials } = await buildEffectiveCredentials(this.vault, provider, config, {});
		// Ensures credentials are still resolvable — throws a typed error (→ 400) otherwise.
		provider.validateCredentials(credentials);

		await this.active.setActive(command.orgId, config.id);
		await this.notifier.notifyChanged(command.orgId);

		// If the caller names the project it is about to chat in, build that
		// project's RocketRide pipeline SYNCHRONOUSLY and report readiness — the UI
		// holds a loader on this call so the user never chats mid-build. Then warm
		// the org's other projects in the background so their first chat is fast too
		// (the already-warmed one is a cheap cache hit in the sweep).
		let ready = true;
		if (command.projectId) {
			ready = await this.notifier.warmChatPipeline(command.orgId, command.projectId);
		}
		void this.notifier.warmChatPipelines(command.orgId);

		return { activeProvider: command.provider, defaultModel: config.defaultModel, ready };
	}
}
