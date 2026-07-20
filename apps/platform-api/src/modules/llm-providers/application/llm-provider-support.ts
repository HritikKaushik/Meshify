import type { CredentialVault } from '@meshify/providers';
import type { LlmProvider, LlmCredentials, LlmProviderManifest, ModelInfo } from '@meshify/ai';
import type { LLMProviderConfiguration } from '@meshify/data-access';

/** The org has no configuration for this provider (never connected). */
export class LlmProviderConfigNotFoundError extends Error {
	constructor(provider: string) {
		super(`No configuration found for provider "${provider}".`);
		this.name = 'LlmProviderConfigNotFoundError';
	}
}

/** A request was structurally invalid (e.g. activating without a default model). */
export class LlmProviderValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LlmProviderValidationError';
	}
}

/**
 * Assembles the effective `LlmCredentials` (decrypted secrets + non-secret
 * config) for a provider, merging freshly submitted `values` over any already
 * stored values. Blank secret fields fall back to the stored vault value — the
 * rotation-friendly pattern used by the Integrations BYOA flow. Also returns the
 * subset that should be *persisted* (submitted, non-blank), so callers write
 * only what changed and never re-encrypt unchanged secrets.
 */
export async function buildEffectiveCredentials(
	vault: CredentialVault,
	provider: LlmProvider,
	existing: LLMProviderConfiguration | undefined,
	values: Record<string, string>
): Promise<{ credentials: LlmCredentials; secretUpdates: Record<string, string>; configUpdates: Record<string, string> }> {
	const secrets: Record<string, string> = {};
	const config: Record<string, string> = {};
	const secretUpdates: Record<string, string> = {};
	const configUpdates: Record<string, string> = {};

	for (const field of provider.manifest.credentialFields) {
		const submitted = values[field.key]?.trim();
		if (field.secret) {
			if (submitted) {
				secrets[field.key] = submitted;
				secretUpdates[field.key] = submitted;
			} else if (existing) {
				const stored = await vault.get(existing.id, field.key);
				if (stored) secrets[field.key] = stored.value;
			}
		} else {
			const stored = existing && typeof existing.config[field.key] === 'string' ? (existing.config[field.key] as string) : undefined;
			const value = submitted ?? stored;
			if (value !== undefined && value !== '') config[field.key] = value;
			if (submitted !== undefined) configUpdates[field.key] = submitted;
		}
	}

	return { credentials: { secrets, config }, secretUpdates, configUpdates };
}

/** Picks the default model: explicit request → existing → provider's recommended static model → null. */
export function pickDefaultModel(provider: LlmProvider, requested: string | undefined, existing: LLMProviderConfiguration | undefined): string | null {
	if (requested && requested.trim()) return requested.trim();
	if (existing?.defaultModel) return existing.defaultModel;
	const recommended = provider.defaultModels().find((model) => model.recommended) ?? provider.defaultModels()[0];
	return recommended?.id ?? null;
}

/** Non-secret manifest facts safe to expose to the browser. */
export function publicManifest(manifest: LlmProviderManifest) {
	return {
		id: manifest.id,
		displayName: manifest.displayName,
		summary: manifest.summary,
		iconKey: manifest.iconKey,
		brandColor: manifest.brandColor,
		docsUrl: manifest.docsUrl,
		auth: manifest.auth,
		modelSource: manifest.modelSource,
		allowCustomModel: manifest.allowCustomModel,
	};
}

/** Serializes a configuration to a display DTO — never includes any secret value. */
export function toConfigView(config: LLMProviderConfiguration | undefined, active: boolean) {
	if (!config) {
		return { status: 'not_connected' as const, defaultModel: null, active: false, configured: false, lastError: null };
	}
	return {
		status: config.status,
		defaultModel: config.defaultModel,
		active,
		configured: true,
		lastError: config.lastError,
		// Non-secret config values (endpoint, base_url, server_url, …) are safe to echo.
		config: config.config,
		updatedAt: config.updatedAt.toISOString(),
	};
}

/**
 * Credential-field metadata for the connect/rotate form — secrets are reported
 * only as `configured: boolean`, their values NEVER echoed.
 */
export async function toFieldViews(vault: CredentialVault, provider: LlmProvider, existing: LLMProviderConfiguration | undefined) {
	const views = [];
	for (const field of provider.manifest.credentialFields) {
		let configured = false;
		if (existing) {
			if (field.secret) configured = (await vault.get(existing.id, field.key)) !== undefined;
			else configured = typeof existing.config[field.key] === 'string' && (existing.config[field.key] as string).length > 0;
		}
		views.push({
			key: field.key,
			label: field.label,
			secret: field.secret,
			placeholder: field.placeholder,
			multiline: field.multiline ?? false,
			optional: field.optional ?? false,
			hint: field.hint,
			configured,
		});
	}
	return views;
}

export function toModelView(models: ModelInfo[]) {
	return models.map((model) => ({ id: model.id, label: model.label, contextTokens: model.contextTokens, recommended: model.recommended ?? false }));
}
