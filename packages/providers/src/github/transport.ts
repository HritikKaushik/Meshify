import { GitHubAppAuth, GitHubAppClient } from '@meshify/github';
import type { GitHubAppSettings, GitHubAppTransport } from './deps.js';

/** Real transport over api.github.com — GitHubAppClient satisfies the port structurally. */
export function createGitHubTransport(app: GitHubAppSettings): GitHubAppTransport {
	return new GitHubAppClient(new GitHubAppAuth({ appId: app.appId, privateKey: app.privateKey }));
}
