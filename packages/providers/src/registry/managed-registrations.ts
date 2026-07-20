import type { ManagedRegistration } from './provider-registration-service.js';

/** The env fields the built-in managed providers read (a subset of @meshify/config's Env, kept dependency-free). */
export interface ManagedRegistrationEnv {
	GITHUB_APP_ID?: string;
	GITHUB_APP_PRIVATE_KEY?: string;
	GITHUB_APP_SLUG?: string;
	GITHUB_APP_CLIENT_ID?: string;
	GITHUB_APP_CLIENT_SECRET?: string;
	GITHUB_APP_WEBHOOK_SECRET?: string;
	SLACK_CLIENT_ID?: string;
	SLACK_CLIENT_SECRET?: string;
	SLACK_REDIRECT_URI?: string;
	SLACK_SIGNING_SECRET?: string;
}

/**
 * Build the deployment's managed provider registrations from env, once — the
 * uniform config/secret-key mapping lived duplicated in both composition roots;
 * it now lives here so the two apps stay in lockstep.
 *
 * GitHub is gated on its user-authorization client credentials too: without
 * them installation ownership can't be verified, so the provider must fail
 * closed rather than offer an unverifiable connect.
 */
export function buildManagedRegistrations(env: ManagedRegistrationEnv): Map<string, ManagedRegistration> {
	const managed = new Map<string, ManagedRegistration>();

	if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_APP_SLUG && env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET) {
		managed.set('github', {
			config: { app_id: env.GITHUB_APP_ID, app_slug: env.GITHUB_APP_SLUG, app_client_id: env.GITHUB_APP_CLIENT_ID },
			secrets: {
				app_private_key: env.GITHUB_APP_PRIVATE_KEY,
				app_client_secret: env.GITHUB_APP_CLIENT_SECRET,
				...(env.GITHUB_APP_WEBHOOK_SECRET ? { app_webhook_secret: env.GITHUB_APP_WEBHOOK_SECRET } : {}),
			},
		});
	}

	if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI) {
		managed.set('slack', {
			config: { app_client_id: env.SLACK_CLIENT_ID, app_redirect_uri: env.SLACK_REDIRECT_URI },
			secrets: { app_client_secret: env.SLACK_CLIENT_SECRET, ...(env.SLACK_SIGNING_SECRET ? { app_signing_secret: env.SLACK_SIGNING_SECRET } : {}) },
		});
	}

	return managed;
}
