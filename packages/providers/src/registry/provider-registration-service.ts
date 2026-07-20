import type { RegistrationContext, VaultHandle } from '../base/context.js';
import type { CredentialVault } from '../vault/credential-vault.js';

/** A deployment's managed (default) registration for a provider, resolved from env. */
export interface ManagedRegistration {
	/** Non-secret app config with uniform keys (app_id, app_slug, app_client_id, app_redirect_uri, …). */
	config: Record<string, unknown>;
	/** App-level secrets by kind (app_private_key, app_webhook_secret, app_client_secret, app_signing_secret, …). */
	secrets: Record<string, string>;
}

/** Structural port over the provider-registration repository (BYOA rows). */
export interface RegistrationStore {
	findByOrgAndProvider(orgId: string, provider: string): Promise<{ id: string; config: Record<string, unknown> } | undefined>;
	findById(id: string): Promise<{ id: string; provider: string; config: Record<string, unknown> } | undefined>;
	listByOrg(orgId: string): Promise<Array<{ id: string; provider: string; config: Record<string, unknown> }>>;
}

/** A read-only vault handle over a static secret map (the virtual managed registration's env secrets). */
function readOnlySecrets(secrets: Record<string, string>): VaultHandle {
	return {
		async get(kind) {
			return kind in secrets ? { value: secrets[kind]!, expiresAt: null } : undefined;
		},
		async put() {
			throw new Error('Managed registration secrets are read-only (they come from deployment env)');
		},
		async delete() {
			throw new Error('Managed registration secrets are read-only (they come from deployment env)');
		},
	};
}

/**
 * Resolves an organization's Provider Registration — the layer that owns
 * application-level credentials. Every org has a VIRTUAL managed registration
 * (from deployment env); creating a BYOA registration switches the org to its
 * own app. This is what lets OAuth resolve provider credentials before an
 * Integration exists, dissolving the circular dependency.
 */
export class ProviderRegistrationService {
	constructor(
		private readonly store: RegistrationStore,
		/** Vault scoped to provider_registration_credentials (app-level secrets). */
		private readonly registrationVault: CredentialVault,
		/** Managed registrations by provider id (deployment env); absent = provider not configured at deployment. */
		private readonly managed: Map<string, ManagedRegistration>
	) {}

	/** Resolve the registration to use for a fresh connect (org + provider). */
	async resolve(orgId: string, provider: string): Promise<RegistrationContext | undefined> {
		const byoa = await this.store.findByOrgAndProvider(orgId, provider);
		if (byoa) return { provider, mode: 'byoa', registrationId: byoa.id, config: byoa.config, secrets: this.registrationVault.forIntegration(byoa.id) };
		const managed = this.managed.get(provider);
		if (managed) return { provider, mode: 'managed', config: managed.config, secrets: readOnlySecrets(managed.secrets) };
		return undefined;
	}

	/**
	 * Resolve the registration an integration was CONNECTED THROUGH. Its
	 * registration_id is authoritative: BYOA rows keep working via their id, and
	 * a null id means the managed app — never a BYOA app the org added later
	 * (installations/tokens are bound to the app they were created on).
	 */
	async resolveForIntegration(integration: { orgId: string; provider: string; registrationId: string | null }): Promise<RegistrationContext | undefined> {
		if (integration.registrationId) {
			const reg = await this.store.findById(integration.registrationId);
			if (reg) return { provider: integration.provider, mode: 'byoa', registrationId: reg.id, config: reg.config, secrets: this.registrationVault.forIntegration(reg.id) };
		}
		return this.managedContext(integration.provider);
	}

	/** Whether the org can operate this provider (managed env present or a BYOA registration exists). */
	async isConfigured(orgId: string, provider: string): Promise<boolean> {
		return (await this.resolve(orgId, provider)) !== undefined;
	}

	/**
	 * The set of providers this org can operate — one `listByOrg` query plus the
	 * managed map, so the marketplace catalog needs a single DB round-trip
	 * instead of one per provider.
	 */
	async configuredProviders(orgId: string): Promise<Set<string>> {
		const byoa = await this.store.listByOrg(orgId);
		return new Set([...this.managed.keys(), ...byoa.map((r) => r.provider)]);
	}

	/** The virtual managed registration for a provider (deployment env) — used by the managed webhook route. */
	managedContext(provider: string): RegistrationContext | undefined {
		const managed = this.managed.get(provider);
		if (!managed) return undefined;
		return { provider, mode: 'managed', config: managed.config, secrets: readOnlySecrets(managed.secrets) };
	}

	/** Resolve a specific BYOA registration by id — used by the per-registration webhook route. */
	async resolveById(registrationId: string): Promise<RegistrationContext | undefined> {
		const reg = await this.store.findById(registrationId);
		if (!reg) return undefined;
		return { provider: reg.provider, mode: 'byoa', registrationId: reg.id, config: reg.config, secrets: this.registrationVault.forIntegration(reg.id) };
	}
}
