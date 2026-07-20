import type { ProviderRegistrationRepository } from '@meshify/data-access';
import type { ByoaConfigField, CredentialVault, ProviderRegistry } from '@meshify/providers';
import { ProviderNotFoundError, supportsByoa } from '@meshify/providers';
import { UnsupportedProviderOperationError } from './integration-support.js';

/** Whether a field name is a secret (stored in the registration vault) — provider-declared. */
function secretKinds(fields: ByoaConfigField[]): Set<string> {
	return new Set(fields.filter((f) => f.secret).map((f) => f.key));
}

export interface RegistrationFieldView {
	key: string;
	label: string;
	secret: boolean;
	multiline: boolean;
	placeholder?: string;
	/** Whether a value is already stored (secrets are write-only — never echoed). */
	configured: boolean;
}

/**
 * The org's Provider Registration form for a provider. Describes the
 * provider-declared BYOA fields merged with the org's stored registration
 * (mode = byoa when a registration row exists, else the virtual managed).
 */
export class DescribeRegistrationUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly registrations: ProviderRegistrationRepository,
		private readonly registrationVault: CredentialVault
	) {}

	async execute(command: { orgId: string; provider: string }): Promise<{ mode: 'managed' | 'byoa'; fields: RegistrationFieldView[] }> {
		const provider = this.registry.get(command.provider);
		if (!supportsByoa(provider)) throw new UnsupportedProviderOperationError(command.provider, 'bring-your-own-app');

		const registration = await this.registrations.findByOrgAndProvider(command.orgId, command.provider);
		const fields = provider.describeByoaConfig();
		const views = await Promise.all(
			fields.map(async (field): Promise<RegistrationFieldView> => {
				let configured = false;
				if (!registration) configured = false;
				else if (field.secret) configured = (await this.registrationVault.get(registration.id, field.key).catch(() => undefined)) !== undefined;
				else configured = registration.config[field.key] != null;
				return { key: field.key, label: field.label, secret: field.secret, multiline: field.multiline ?? false, placeholder: field.placeholder, configured };
			})
		);
		return { mode: registration ? 'byoa' : 'managed', fields: views };
	}
}

/**
 * Create/update the org's BYOA Provider Registration for a provider: secrets
 * to the registration vault (write-only), non-secret fields to the
 * registration config, and returns the webhook URL path the org's app must
 * target. Switching an org to BYOA governs FUTURE connects — existing
 * integrations keep the registration they connected through (app-bound grants
 * cannot be retargeted).
 */
export class ConfigureRegistrationUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly registrations: ProviderRegistrationRepository,
		private readonly registrationVault: CredentialVault
	) {}

	async execute(command: { orgId: string; provider: string; values: Record<string, string> }): Promise<{ webhookPath: string }> {
		const provider = this.registry.get(command.provider);
		if (!supportsByoa(provider)) throw new UnsupportedProviderOperationError(command.provider, 'bring-your-own-app');

		const fields = provider.describeByoaConfig();
		const secrets = secretKinds(fields);
		const existing = await this.registrations.findByOrgAndProvider(command.orgId, command.provider);

		// Validate the effective config: submitted values, or (for kept blank
		// secrets on update) the true stored value — decrypted in memory, never
		// returned — so the provider's format checks stay honest.
		const effective: Record<string, string> = {};
		for (const field of fields) {
			const submitted = command.values[field.key]?.trim();
			if (submitted) effective[field.key] = submitted;
			else if (field.secret && existing) {
				const stored = await this.registrationVault.get(existing.id, field.key).catch(() => undefined);
				if (stored) effective[field.key] = stored.value;
			} else if (!field.secret && existing && typeof existing.config[field.key] === 'string') {
				effective[field.key] = existing.config[field.key] as string;
			}
		}
		provider.validateByoaConfig(Object.fromEntries(fields.map((f) => [f.key, effective[f.key] ?? ''])) as Record<string, string>);

		const config: Record<string, unknown> = {};
		for (const field of fields) {
			if (secrets.has(field.key)) continue;
			const value = command.values[field.key]?.trim();
			if (value) config[field.key] = value;
		}

		const registration = await this.registrations.upsert({ orgId: command.orgId, provider: command.provider, config });

		for (const field of fields) {
			if (!secrets.has(field.key)) continue;
			const value = command.values[field.key]?.trim();
			if (value) await this.registrationVault.put(registration.id, field.key, value);
		}

		return { webhookPath: `/v1/integrations/webhooks/${command.provider}/${registration.id}` };
	}
}

export { ProviderNotFoundError };
