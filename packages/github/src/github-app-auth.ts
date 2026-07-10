import { createSign } from 'node:crypto';

/**
 * GitHub App authentication without the octokit dependency tree: mint the
 * app JWT (RS256, ≤10 min lifetime per GitHub's rules), resolve the
 * installation that covers a repository, and exchange it for a short-lived
 * installation access token. Tokens are cached until shortly before expiry.
 */
export interface GitHubAppConfig {
	appId: string;
	/** PEM private key; \n-escaped single-line form (common in env vars) is normalized. */
	privateKey: string;
	apiBaseUrl?: string;
}

const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export class GitHubAppAuth {
	private readonly apiBaseUrl: string;
	private readonly privateKey: string;
	private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

	constructor(private readonly config: GitHubAppConfig) {
		this.apiBaseUrl = config.apiBaseUrl ?? 'https://api.github.com';
		this.privateKey = config.privateKey.includes('\\n') ? config.privateKey.replace(/\\n/g, '\n') : config.privateKey;
	}

	/** Short-lived JWT identifying the App itself (for /app/* and installation discovery). */
	appJwt(): string {
		const now = Math.floor(Date.now() / 1000);
		const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
		// iat backdated 60s to absorb clock drift, per GitHub's own recommendation.
		const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: this.config.appId }));
		const signer = createSign('RSA-SHA256');
		signer.update(`${header}.${payload}`);
		const signature = signer.sign(this.privateKey).toString('base64url');
		return `${header}.${payload}.${signature}`;
	}

	/** Installation access token scoped to the installation that covers owner/repo. Cached until near expiry. */
	async installationToken(owner: string, repo: string): Promise<string> {
		const cacheKey = `${owner}/${repo}`;
		const cached = this.tokenCache.get(cacheKey);
		if (cached && cached.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()) return cached.token;

		const jwt = this.appJwt();

		const installationRes = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/installation`, {
			headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json' },
		});
		if (!installationRes.ok) {
			throw new Error(`GitHub App is not installed on ${owner}/${repo} (or lacks access): ${installationRes.status} ${await installationRes.text()}`);
		}
		const installation = (await installationRes.json()) as { id: number };

		const tokenRes = await fetch(`${this.apiBaseUrl}/app/installations/${installation.id}/access_tokens`, {
			method: 'POST',
			headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json' },
		});
		if (!tokenRes.ok) {
			throw new Error(`Failed to create installation token for ${owner}/${repo}: ${tokenRes.status} ${await tokenRes.text()}`);
		}
		const tokenBody = (await tokenRes.json()) as { token: string; expires_at: string };

		this.tokenCache.set(cacheKey, { token: tokenBody.token, expiresAt: Date.parse(tokenBody.expires_at) });
		return tokenBody.token;
	}
}

function base64url(input: string): string {
	return Buffer.from(input).toString('base64url');
}
