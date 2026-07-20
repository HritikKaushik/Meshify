/**
 * Server-side, single-use OAuth/install state. The browser carries only an
 * opaque random token through the provider redirect; we store its HMAC hash.
 * Consumption is atomic and one-shot, which gives CSRF protection, replay
 * protection, and — crucially for GitHub — the org binding that prevents a
 * guessable `installation_id` from being claimed by the wrong tenant.
 */
export interface OAuthState {
	id: string;
	stateHash: string;
	orgId: string;
	provider: string;
	/** When set, the completed integration is auto-attached to this project. */
	projectId: string | null;
	intent: 'connect' | 'reconnect';
	integrationId: string | null;
	/** SPA path to land on after completion (e.g. the marketplace page). */
	returnPath: string | null;
	createdByKeyId: string | null;
	expiresAt: Date;
	consumedAt: Date | null;
	createdAt: Date;
}
