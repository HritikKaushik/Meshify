import type { SlackAuthIdentity, SlackChannelInfo, SlackOAuthResult } from '@meshify/slack';

/** Meshify's managed Slack app (operator-configured once per deployment), or an org's BYOA app. */
export interface SlackAppSettings {
	clientId: string;
	clientSecret: string;
	signingSecret: string;
	/** Static redirect URL registered on the Slack app → the web app's OAuth callback route. */
	redirectUri: string;
}

/** Structural transport port over @meshify/slack — fakeable in tests. */
export interface SlackTransport {
	buildAuthorizeUrl(state: string): string;
	exchangeCode(code: string): Promise<SlackOAuthResult>;
	refreshToken(refreshToken: string): Promise<SlackOAuthResult>;
	listChannels(token: string): Promise<SlackChannelInfo[]>;
	testAuth(token: string): Promise<SlackAuthIdentity>;
	revokeToken(token: string): Promise<boolean>;
}

export interface SlackProviderDeps {
	/** Builds a transport from app settings resolved per-operation from the registration (managed or BYOA). */
	transportFactory: (settings: SlackAppSettings) => SlackTransport;
	/** Content-sync wiring (detail ports + Slack read client) — provided by the worker only. */
	sync?: import('./sync.js').SlackSyncDeps;
	now?: () => Date;
}
