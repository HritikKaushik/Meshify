import { LlmProviderError, type LlmProviderRegistry, type TestConnectionResult } from '@meshify/ai';
import type { CredentialVault } from '@meshify/providers';
import type { LlmProviderConfigurationRepository } from '@meshify/data-access';
import { buildEffectiveCredentials } from './llm-provider-support.js';

export interface TestLlmProviderCommand {
	orgId: string;
	provider: string;
	/** Optional freshly-entered values to test BEFORE saving; falls back to stored creds. */
	values?: Record<string, string>;
	/** Optional model to probe; falls back to the stored default model. */
	model?: string;
}

/**
 * Live connection test — the "Test Connection" button. Authenticates against the
 * provider and returns models/latency/region, or an actionable error. Never
 * throws: structural/credential failures are captured in the result so the UI
 * can render them, and the stored status is updated to connected/error.
 */
export class TestLlmProviderUseCase {
	constructor(
		private readonly registry: LlmProviderRegistry,
		private readonly configs: LlmProviderConfigurationRepository,
		private readonly vault: CredentialVault
	) {}

	async execute(command: TestLlmProviderCommand): Promise<TestConnectionResult> {
		const provider = this.registry.get(command.provider);
		const existing = await this.configs.findByOrgAndProvider(command.orgId, command.provider);
		const { credentials } = await buildEffectiveCredentials(this.vault, provider, existing, command.values ?? {});
		const model = command.model ?? existing?.defaultModel ?? undefined;

		let result: TestConnectionResult;
		try {
			result = await provider.testConnection(credentials, { model });
		} catch (err) {
			result = {
				ok: false,
				error: err instanceof Error ? err.message : 'Connection test failed.',
				errorCode: err instanceof LlmProviderError ? err.code : 'unknown',
			};
		}

		if (existing) {
			await this.configs.updateStatus(existing.id, result.ok ? 'connected' : 'error', result.ok ? null : result.error ?? 'Connection test failed');
		}
		return result;
	}
}
