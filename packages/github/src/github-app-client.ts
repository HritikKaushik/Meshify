import type { GitHubAppAuth } from './github-app-auth.js';

/**
 * App-level GitHub operations keyed by installation id (the provider
 * platform's grain), complementing GitHubRepoClient's owner/repo-scoped reads.
 * Same dependency-free raw-fetch style as the rest of this package.
 */

export interface GitHubInstallation {
	id: number;
	account: { id: number; login: string; type: 'Organization' | 'User'; avatarUrl: string | null };
	/** 'all' or 'selected' — whether the grant covers every repo or a chosen set. */
	repositorySelection: 'all' | 'selected';
	suspendedAt: string | null;
}

export interface InstallationRepo {
	id: number;
	name: string;
	fullName: string;
	owner: string;
	private: boolean;
	defaultBranch: string;
	description: string | null;
}

export interface InstallationToken {
	token: string;
	expiresAt: Date;
}

const PAGE_SIZE = 100;

/** GitHub App OAuth (user-authorization) settings — needed to verify installation ownership at connect. */
export interface GitHubUserOAuth {
	clientId: string;
	clientSecret: string;
}

export class GitHubAppClient {
	private readonly apiBaseUrl: string;
	private readonly oauthBaseUrl: string;

	constructor(
		private readonly auth: GitHubAppAuth,
		private readonly userOAuth?: GitHubUserOAuth,
		apiBaseUrl = 'https://api.github.com',
		oauthBaseUrl = 'https://github.com'
	) {
		this.apiBaseUrl = apiBaseUrl;
		this.oauthBaseUrl = oauthBaseUrl;
	}

	/**
	 * Exchange the user-authorization `code` (returned by installations/new when
	 * "Request user authorization during installation" is enabled) for a
	 * user-to-server token. Proves the caller is the GitHub user who authorized.
	 */
	async exchangeUserCode(code: string): Promise<string> {
		if (!this.userOAuth) throw new Error('GitHub App user OAuth (client id/secret) is not configured');
		const res = await fetch(`${this.oauthBaseUrl}/login/oauth/access_token`, {
			method: 'POST',
			headers: { accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ client_id: this.userOAuth.clientId, client_secret: this.userOAuth.clientSecret, code }),
		});
		if (!res.ok) throw new Error(`GitHub user code exchange failed: ${res.status}`);
		const body = (await res.json()) as { access_token?: string; error?: string };
		if (!body.access_token) throw new Error(`GitHub user code exchange rejected: ${body.error ?? 'no access_token'}`);
		return body.access_token;
	}

	/** The installation ids the authenticated USER can access — the ownership set to check installation_id against. */
	async listUserInstallationIds(userToken: string): Promise<Set<string>> {
		const ids = new Set<string>();
		for (let page = 1; ; page += 1) {
			const res = await fetch(`${this.apiBaseUrl}/user/installations?per_page=${PAGE_SIZE}&page=${page}`, {
				headers: { authorization: `Bearer ${userToken}`, accept: 'application/vnd.github+json' },
			});
			if (!res.ok) throw new Error(`GitHub user installations lookup failed: ${res.status}`);
			const body = (await res.json()) as { installations: Array<{ id: number }> };
			for (const i of body.installations) ids.add(String(i.id));
			if (body.installations.length < PAGE_SIZE) return ids;
		}
	}

	/** Fetch an installation of THIS app by id — the callback-verification primitive. Throws on 404 (not our installation). */
	async getInstallation(installationId: string | number): Promise<GitHubInstallation> {
		const res = await fetch(`${this.apiBaseUrl}/app/installations/${installationId}`, {
			headers: { authorization: `Bearer ${this.auth.appJwt()}`, accept: 'application/vnd.github+json' },
		});
		if (!res.ok) {
			throw new Error(`GitHub installation ${installationId} not found for this app: ${res.status} ${await res.text()}`);
		}
		const body = (await res.json()) as {
			id: number;
			account: { id: number; login: string; type: string; avatar_url?: string };
			repository_selection: string;
			suspended_at: string | null;
		};
		return {
			id: body.id,
			account: {
				id: body.account.id,
				login: body.account.login,
				type: body.account.type === 'Organization' ? 'Organization' : 'User',
				avatarUrl: body.account.avatar_url ?? null,
			},
			repositorySelection: body.repository_selection === 'all' ? 'all' : 'selected',
			suspendedAt: body.suspended_at,
		};
	}

	/** Mint a fresh installation access token (~1h lifetime). Callers own caching (the vault does, DB-shared). */
	async createInstallationToken(installationId: string | number): Promise<InstallationToken> {
		const res = await fetch(`${this.apiBaseUrl}/app/installations/${installationId}/access_tokens`, {
			method: 'POST',
			headers: { authorization: `Bearer ${this.auth.appJwt()}`, accept: 'application/vnd.github+json' },
		});
		if (!res.ok) {
			throw new Error(`Failed to create installation token for installation ${installationId}: ${res.status} ${await res.text()}`);
		}
		const body = (await res.json()) as { token: string; expires_at: string };
		return { token: body.token, expiresAt: new Date(body.expires_at) };
	}

	/** Every repository the installation grants access to (paginated) — the repo picker's source. */
	async listInstallationRepos(installationToken: string): Promise<InstallationRepo[]> {
		const repos: InstallationRepo[] = [];
		for (let page = 1; ; page += 1) {
			const res = await fetch(`${this.apiBaseUrl}/installation/repositories?per_page=${PAGE_SIZE}&page=${page}`, {
				headers: { authorization: `Bearer ${installationToken}`, accept: 'application/vnd.github+json' },
			});
			if (!res.ok) {
				throw new Error(`Failed to list installation repositories: ${res.status} ${await res.text()}`);
			}
			const body = (await res.json()) as {
				repositories: Array<{
					id: number;
					name: string;
					full_name: string;
					owner: { login: string };
					private: boolean;
					default_branch: string;
					description: string | null;
				}>;
			};
			for (const r of body.repositories) {
				repos.push({
					id: r.id,
					name: r.name,
					fullName: r.full_name,
					owner: r.owner.login,
					private: r.private,
					defaultBranch: r.default_branch,
					description: r.description,
				});
			}
			if (body.repositories.length < PAGE_SIZE) return repos;
		}
	}
}
