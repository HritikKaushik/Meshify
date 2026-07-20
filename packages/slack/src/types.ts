/** A single Slack message as returned by conversations.history/replies. */
export interface SlackMessage {
	ts: string;
	threadTs?: string;
	user?: string;
	text: string;
	subtype?: string;
	reactions?: Array<{ name: string; count: number }>;
}

/** A channel/conversation as returned by conversations.list. */
export interface SlackChannelInfo {
	id: string;
	name: string;
	isPrivate: boolean;
}

/** A resolved user, name preferring real_name then display name then handle. */
export interface SlackUserInfo {
	id: string;
	name: string;
}

/**
 * Result of the oauth.v2.access token exchange (bot token flow). When the
 * Slack app has token rotation enabled, `refreshToken`/`expiresInSeconds` are
 * present and the access token must be refreshed before expiry; otherwise the
 * bot token is non-expiring and both are null.
 */
export interface SlackOAuthResult {
	accessToken: string;
	teamId: string;
	teamName: string | null;
	botUserId: string | null;
	scope: string | null;
	refreshToken: string | null;
	expiresInSeconds: number | null;
	/** Slack app id (`api_app_id`) — routes Events API deliveries to the owning app config. */
	appId: string | null;
}
