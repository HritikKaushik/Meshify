/**
 * An org-level authorization of a provider: a GitHub App installation, a Slack
 * workspace install, a future SharePoint site consent. Owns the credentials
 * (in `integration_credentials`, encrypted) and the webhook/health state.
 * Projects attach resources through `knowledge_connectors.integration_id`.
 */

/** Provider ids are validated by the ProviderRegistry, not by this package. */
export type ProviderId = string;

export type IntegrationMode = 'managed' | 'byoa';

export type IntegrationStatus = 'pending' | 'active' | 'error' | 'revoked' | 'disconnected';

/** Platform health vocabulary; surfaced in the marketplace UI. */
export type IntegrationHealth =
	| 'unknown'
	| 'healthy'
	| 'syncing'
	| 'token_expired'
	| 'permission_changed'
	| 'webhook_broken'
	| 'needs_reauthorization'
	| 'partially_connected'
	| 'disconnected';

export interface Integration {
	id: string;
	orgId: string;
	provider: ProviderId;
	mode: IntegrationMode;
	/** The provider's natural id for the grant: GitHub installation id, Slack team id, … */
	externalAccountId: string;
	externalAccountName: string;
	status: IntegrationStatus;
	health: IntegrationHealth;
	healthDetail: Record<string, unknown>;
	healthCheckedAt: Date | null;
	/** Provider-specific, non-sensitive facts (account login/type, scopes, avatar). Secrets live in `integration_credentials`. */
	metadata: Record<string, unknown>;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
}
