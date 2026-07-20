import type { Integration, KnowledgeConnector } from '@meshify/data-access';

/**
 * Vault access scoped to a single owner (an integration's runtime credentials,
 * or a registration's app-level secrets). Providers receive only a scoped
 * handle — never the vault itself — so a provider cannot read another owner's
 * credentials by construction.
 */
export interface VaultHandle {
	get(kind: string, opts?: { minTtlMs?: number }): Promise<{ value: string; expiresAt: Date | null } | undefined>;
	put(kind: string, value: string, expiresAt?: Date | null): Promise<void>;
	delete(kind: string): Promise<void>;
}

/** The organization's application registration for a provider (managed or BYOA), resolved to app config + secret access. */
export interface RegistrationContext {
	provider: string;
	mode: 'managed' | 'byoa';
	/** The BYOA registration row id (for binding an integration to it); undefined for the virtual managed registration. */
	registrationId?: string;
	/** Non-secret app config (app_id, app_slug, app_client_id, app_redirect_uri, …) — uniform keys across managed and BYOA. */
	config: Record<string, unknown>;
	/** Vault handle scoped to the registration's app-level secrets. */
	secrets: VaultHandle;
}

/**
 * The integration a capability call operates on: its runtime-credential vault
 * plus the provider registration whose app credentials back it. The
 * registration is the app-credential owner; the integration owns only runtime
 * credentials (installation/bot/refresh tokens).
 */
export interface IntegrationContext {
	integration: Integration;
	vault: VaultHandle;
	registration: RegistrationContext;
}

/** Connector-level context for sync/citation work (always carries the owning integration + its registration). */
export interface ConnectorContext extends IntegrationContext {
	connector: KnowledgeConnector;
}
