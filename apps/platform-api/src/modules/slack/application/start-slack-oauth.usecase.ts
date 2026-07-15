import { buildAuthorizeUrl, signState } from '@meshify/slack';
import { requireSlackConfig, type SlackRuntimeConfig } from './slack-support.js';

/**
 * Begins the Slack OAuth flow. Returns the authorize URL the browser is sent to.
 * The projectId is carried in a signed `state` (Slack's redirect URI is static
 * and cannot hold a path param), and the client secret never leaves the server.
 */
export class StartSlackOAuthUseCase {
	constructor(
		private readonly config: SlackRuntimeConfig,
		private readonly now: () => number = () => Date.now()
	) {}

	execute(command: { projectId: string }): { authorizeUrl: string } {
		const config = requireSlackConfig(this.config);
		const state = signState({ projectId: command.projectId }, config.secret, this.now());
		const authorizeUrl = buildAuthorizeUrl({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri }, state);
		return { authorizeUrl };
	}
}
