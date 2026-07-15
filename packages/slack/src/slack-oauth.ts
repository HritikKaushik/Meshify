import type { SlackOAuthResult } from './types.js';

export interface SlackOAuthConfig {
	clientId: string;
	clientSecret: string;
	/** Must exactly match a Redirect URL registered on the Slack app (a static, same-origin web route). */
	redirectUri: string;
	apiBaseUrl?: string;
}

/** Bot scopes required to read channel history for ingestion. */
export const SLACK_BOT_SCOPES = ['channels:read', 'groups:read', 'channels:history', 'groups:history', 'users:read'];

const SLACK_API_BASE = 'https://slack.com/api';
const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';

/**
 * Builds the Slack authorize URL the browser is redirected to. `state` is an
 * opaque signed token (see oauth-state.ts) carrying the projectId + a CSRF
 * nonce — Slack echoes it back to the static redirect URI unchanged.
 */
export function buildAuthorizeUrl(config: SlackOAuthConfig, state: string, scopes: string[] = SLACK_BOT_SCOPES): string {
	const params = new URLSearchParams({
		client_id: config.clientId,
		scope: scopes.join(','),
		redirect_uri: config.redirectUri,
		state,
	});
	return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Server-side exchange of the OAuth `code` for a bot access token via
 * oauth.v2.access. Runs only in platform-api (client secret never reaches the
 * browser). Returns the token + team identity to persist (token encrypted).
 */
export async function exchangeCodeForToken(config: SlackOAuthConfig, code: string): Promise<SlackOAuthResult> {
	const res = await fetch(`${config.apiBaseUrl ?? SLACK_API_BASE}/oauth.v2.access`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
			redirect_uri: config.redirectUri,
		}).toString(),
	});

	if (!res.ok) throw new Error(`Slack oauth.v2.access failed: HTTP ${res.status}`);
	const body = (await res.json()) as {
		ok: boolean;
		error?: string;
		access_token?: string;
		scope?: string;
		bot_user_id?: string;
		team?: { id?: string; name?: string };
	};

	if (!body.ok || !body.access_token || !body.team?.id) {
		throw new Error(`Slack OAuth exchange rejected: ${body.error ?? 'missing access_token/team'}`);
	}

	return {
		accessToken: body.access_token,
		teamId: body.team.id,
		teamName: body.team.name ?? null,
		botUserId: body.bot_user_id ?? null,
		scope: body.scope ?? null,
	};
}
