import type { LlmProviderRegistry } from '@meshify/ai';
import type { CredentialVault } from '@meshify/providers';
import type { LlmProviderConfigurationRepository } from '@meshify/data-access';
import type { ResolvedLlmConfig } from '@meshify/rocketride-gateway';
import { buildEffectiveCredentials } from '../application/llm-provider-support.js';

/**
 * The provider-resolution layer that makes RocketRide vendor-agnostic. Given an
 * org, it resolves the ACTIVE LLM provider + decrypted credentials + default
 * model into a `ResolvedLlmConfig` the gateway injects into the chat pipeline —
 * RocketRide never learns which vendor is active.
 *
 * Returns `null` when there is no active provider (or it is not resolvable), in
 * which case the chat resolver falls back to the managed default so existing
 * OpenAI workflows keep working.
 *
 * Results are cached per org and invalidated on any provider change (see
 * `InProcessLlmProviderChangeNotifier`), so the chat hot path does no DB/vault
 * work on a cache hit.
 */
export class LlmResolutionService {
	private readonly cache = new Map<string, ResolvedLlmConfig | null>();

	constructor(
		private readonly registry: LlmProviderRegistry,
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly vault: CredentialVault
	) {}

	async resolveForOrg(orgId: string): Promise<ResolvedLlmConfig | null> {
		if (this.cache.has(orgId)) return this.cache.get(orgId) ?? null;
		const resolved = await this.compute(orgId);
		this.cache.set(orgId, resolved);
		return resolved;
	}

	invalidate(orgId: string): void {
		this.cache.delete(orgId);
	}

	private async compute(orgId: string): Promise<ResolvedLlmConfig | null> {
		const config = await this.configs.findActiveByOrg(orgId);
		if (!config || !config.defaultModel) return null;

		const provider = this.registry.find(config.provider);
		if (!provider) return null;

		try {
			const { credentials } = await buildEffectiveCredentials(this.vault, provider, config, {});
			provider.validateCredentials(credentials);
			const node = provider.resolveRocketRideNode({ model: config.defaultModel, credentials });
			return {
				mode: 'resolved',
				component: node.component,
				model: node.model,
				modelTotalTokens: node.modelTotalTokens,
				apiKey: node.apikey,
				baseUrl: node.baseUrl,
				extra: node.extra,
			};
		} catch {
			// Active provider is misconfigured (e.g. missing key after a partial write);
			// fall back to managed rather than break chat.
			return null;
		}
	}
}
