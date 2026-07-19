import type { Integration, KnowledgeConnector } from '@meshify/data-access';

/**
 * Vault access scoped to a single integration. Providers receive only this
 * handle — never the vault itself — so a provider cannot read another
 * integration's credentials by construction.
 */
export interface VaultHandle {
	get(kind: string, opts?: { minTtlMs?: number }): Promise<{ value: string; expiresAt: Date | null } | undefined>;
	put(kind: string, value: string, expiresAt?: Date | null): Promise<void>;
	delete(kind: string): Promise<void>;
}

/** The integration a capability call operates on, plus its scoped secrets. */
export interface IntegrationContext {
	integration: Integration;
	vault: VaultHandle;
}

/** Connector-level context for sync/citation work (always carries the owning integration when one exists). */
export interface ConnectorContext extends IntegrationContext {
	connector: KnowledgeConnector;
}
