import type { IntegrationRepository } from '@meshify/data-access';
import type { ByoaConfigField, CredentialVault, ProviderRegistry } from '@meshify/providers';
import { supportsByoa } from '@meshify/providers';
import { UnsupportedProviderOperationError, loadIntegrationForOrg } from './integration-support.js';

export interface ByoaFieldView {
	key: string;
	label: string;
	secret: boolean;
	multiline: boolean;
	placeholder?: string;
	/** Whether a value is already stored (secrets are write-only — never echoed). */
	configured: boolean;
}

/** The BYOA form for a provider, merged with what the given integration already has stored. */
export class DescribeByoaConfigUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly integrations: IntegrationRepository,
		private readonly vault: CredentialVault
	) {}

	async execute(command: { orgId: string; integrationId: string }): Promise<{ mode: string; fields: ByoaFieldView[] }> {
		const integration = await loadIntegrationForOrg(this.integrations, command.integrationId, command.orgId);
		const provider = this.registry.get(integration.provider);
		if (!supportsByoa(provider)) throw new UnsupportedProviderOperationError(integration.provider, 'bring-your-own-app');

		const fields = provider.describeByoaConfig();
		const views = await Promise.all(fields.map((field) => this.toView(integration.id, field)));
		return { mode: integration.mode, fields: views };
	}

	private async toView(integrationId: string, field: ByoaConfigField): Promise<ByoaFieldView> {
		const stored = field.secret ? await this.vault.get(integrationId, field.key).catch(() => undefined) : undefined;
		return {
			key: field.key,
			label: field.label,
			secret: field.secret,
			multiline: field.multiline ?? false,
			placeholder: field.placeholder,
			configured: field.secret ? stored !== undefined : true,
		};
	}
}

/**
 * Store an org's own provider-app credentials and flip the integration to
 * BYOA mode. Secrets land in the vault under the provider-declared kinds
 * (write-only — never returned); non-secret fields merge into integration
 * metadata. The per-integration webhook URL the enterprise app must target is
 * returned so the admin can paste it into their app config.
 */
export class ConfigureByoaUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly integrations: IntegrationRepository,
		private readonly vault: CredentialVault
	) {}

	async execute(command: { orgId: string; integrationId: string; values: Record<string, string> }): Promise<{ webhookPath: string }> {
		const integration = await loadIntegrationForOrg(this.integrations, command.integrationId, command.orgId);
		const provider = this.registry.get(integration.provider);
		if (!supportsByoa(provider)) throw new UnsupportedProviderOperationError(integration.provider, 'bring-your-own-app');

		const fields = provider.describeByoaConfig();

		// For a first-time submission every field is required; on an update, a
		// blank secret means "keep the stored one" so admins needn't re-enter it.
		// Kept secrets are validated against their true stored value (decrypted
		// in memory, never returned) so the provider's format checks stay honest.
		const effective: Record<string, string> = {};
		for (const field of fields) {
			const submitted = command.values[field.key]?.trim();
			if (submitted) {
				effective[field.key] = submitted;
			} else if (field.secret) {
				const stored = await this.vault.get(integration.id, field.key).catch(() => undefined);
				if (stored) effective[field.key] = stored.value;
			}
		}

		provider.validateByoaConfig(
			Object.fromEntries(fields.map((f) => [f.key, effective[f.key] ?? ''])) as Record<string, string>
		);

		const metadata: Record<string, unknown> = {};
		for (const field of fields) {
			const value = command.values[field.key]?.trim();
			if (!value) continue; // unchanged
			if (field.secret) await this.vault.put(integration.id, field.key, value);
			else metadata[field.key] = value;
		}

		if (Object.keys(metadata).length > 0) await this.integrations.updateAccountInfo(integration.id, { metadata });
		await this.integrations.updateMode(integration.id, 'byoa');

		return { webhookPath: `/v1/integrations/webhooks/${integration.provider}/${integration.id}` };
	}
}
