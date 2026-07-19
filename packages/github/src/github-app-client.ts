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

export class GitHubAppClient {
	private readonly apiBaseUrl: string;

	constructor(private readonly auth: GitHubAppAuth, apiBaseUrl = 'https://api.github.com') {
		this.apiBaseUrl = apiBaseUrl;
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
