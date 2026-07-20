import type { IntegrationContext, RegistrationContext } from './context.js';

/** Inputs for building the provider consent/install URL. */
export interface ConnectInput {
	/** Opaque single-use state token (issued by OAuthStateService); must ride the redirect. */
	stateToken: string;
	intent: 'connect' | 'reconnect';
	/** Set on reconnect — lets providers deep-link to the existing grant's settings. */
	externalAccountId?: string;
}

/** Raw callback parameters as they arrived at the SPA callback route (provider-specific keys). */
export interface CallbackInput {
	params: Record<string, string | undefined>;
}

/** A credential the platform should store (encrypted) for the connected grant. */
export interface CredentialInput {
	kind: string;
	value: string;
	expiresAt?: Date | null;
}

/** The provider-verified identity + secrets of a completed connect. */
export interface ConnectResult {
	externalAccountId: string;
	externalAccountName: string;
	metadata: Record<string, unknown>;
	credentials: CredentialInput[];
}

/** A refreshed credential set (e.g. rotated Slack token, re-minted installation token). */
export interface CredentialRefresh {
	credentials: CredentialInput[];
}

/**
 * Org-level connect/disconnect via the provider's consent screen. The token
 * exchange always runs server-side; the browser only ever carries the state
 * token and provider-issued codes.
 */
export interface OAuthCapable {
	/**
	 * Build the provider consent/install URL using the resolved registration's
	 * app config (slug / client id / redirect uri). The registration is passed
	 * because credentials must exist before an Integration does — that is the
	 * whole reason Provider Registration is a distinct layer.
	 */
	buildConnectUrl(input: ConnectInput, registration: RegistrationContext): string;
	/**
	 * Verify the callback against the provider (token exchange / installation
	 * lookup) using the registration's app credentials, and return the grant's
	 * identity + runtime credentials. MUST throw ProviderAuthError on anything
	 * unverifiable — never trust bare ids.
	 */
	completeConnect(input: CallbackInput, registration: RegistrationContext): Promise<ConnectResult>;
	/** Refresh expiring credentials; return null when nothing needs refreshing. */
	refreshCredentials?(ctx: IntegrationContext): Promise<CredentialRefresh | null>;
	/** Best-effort revocation at the provider on disconnect. */
	revokeAccess?(ctx: IntegrationContext): Promise<void>;
}
