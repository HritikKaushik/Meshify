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

/** Result of the oauth.v2.access token exchange (bot token flow). */
export interface SlackOAuthResult {
	accessToken: string;
	teamId: string;
	teamName: string | null;
	botUserId: string | null;
	scope: string | null;
}
