import { HttpSlackClient, buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken, revokeToken, testAuth } from '@meshify/slack';
import type { SlackAppSettings, SlackTransport } from './deps.js';

/** Real transport over slack.com — OAuth helpers bound to the app config + the paginating HTTP client. */
export function createSlackTransport(app: SlackAppSettings): SlackTransport {
	const oauthConfig = { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: app.redirectUri };
	const client = new HttpSlackClient();
	return {
		buildAuthorizeUrl: (state) => buildAuthorizeUrl(oauthConfig, state),
		exchangeCode: (code) => exchangeCodeForToken(oauthConfig, code),
		refreshToken: (refreshToken) => refreshAccessToken(oauthConfig, refreshToken),
		listChannels: (token) => client.listChannels(token),
		testAuth: (token) => testAuth(token),
		revokeToken: (token) => revokeToken(token),
	};
}
