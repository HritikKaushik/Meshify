/**
 * An organization's application registration for a provider — the owner of
 * application-level credentials (app id, client secret, private key, webhook
 * secret) and OAuth configuration. Integrations reference a registration
 * rather than owning app credentials, which lets OAuth resolve provider
 * credentials before any Integration exists.
 *
 * Only BYOA registrations are persisted; the "managed" registration is virtual
 * (resolved from deployment env), so `mode` here is always `byoa`.
 */
export interface ProviderRegistration {
	id: string;
	orgId: string;
	provider: string;
	mode: 'byoa';
	/** Non-secret app config (app_id, app_slug, app_client_id, app_redirect_uri, …). Secrets live in the credentials table. */
	config: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}
