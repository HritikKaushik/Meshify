
/** Every GitHub call is bounded; a black-holed connection must not hold a worker slot forever. */
const API_TIMEOUT_MS = 30_000;
/** Tarballs of large repositories legitimately take minutes to stream. */
const DOWNLOAD_TIMEOUT_MS = 300_000;
/**
 * Anything that can produce an installation token covering owner/repo:
 * GitHubAppAuth (per-repo discovery, legacy path) or a vault-backed source
 * (provider platform — the DB-cached installation token).
 */
export interface InstallationTokenSource {
	installationToken(owner: string, repo: string): Promise<string>;
}

export interface RepoHead {
	defaultBranch: string;
	headSha: string;
}

export interface ComparedFile {
	path: string;
	status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
	previousPath?: string;
}

/**
 * Read-only GitHub REST operations used by repository ingestion and sync.
 * Consumers: apps/worker (ingest/sync processors); platform-api joins as the
 * second consumer when the push-webhook receiver lands.
 */
export class GitHubRepoClient {
	private readonly apiBaseUrl: string;

	constructor(
		private readonly auth: InstallationTokenSource,
		apiBaseUrl = 'https://api.github.com'
	) {
		this.apiBaseUrl = apiBaseUrl;
	}

	async getHead(owner: string, repo: string): Promise<RepoHead> {
		const repoInfo = (await this.getJson(owner, repo, `/repos/${owner}/${repo}`)) as { default_branch: string };
		const commit = (await this.getJson(owner, repo, `/repos/${owner}/${repo}/commits/${repoInfo.default_branch}`)) as { sha: string };
		return { defaultBranch: repoInfo.default_branch, headSha: commit.sha };
	}

	/** Downloads the repo tarball at `ref`. GitHub responds with a redirect; fetch follows it. */
	async downloadTarball(owner: string, repo: string, ref: string): Promise<Buffer> {
		const token = await this.auth.installationToken(owner, repo);
		const res = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/tarball/${ref}`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
			headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
		});
		if (!res.ok) throw new Error(`Tarball download failed for ${owner}/${repo}@${ref}: ${res.status} ${await res.text()}`);
		return Buffer.from(await res.arrayBuffer());
	}

	/** Files changed between two commits (basis for incremental sync). */
	async compare(owner: string, repo: string, base: string, head: string): Promise<ComparedFile[]> {
		const body = (await this.getJson(owner, repo, `/repos/${owner}/${repo}/compare/${base}...${head}?per_page=100`)) as {
			files?: Array<{ filename: string; status: ComparedFile['status']; previous_filename?: string }>;
		};
		return (body.files ?? []).map((f) => ({ path: f.filename, status: f.status, previousPath: f.previous_filename }));
	}

	/** Single file content at a ref (used by sync for changed files; GitHub caps this API at ~1MB, matching our ingest size cap). */
	async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<Buffer> {
		const body = (await this.getJson(owner, repo, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${ref}`)) as {
			content?: string;
			encoding?: string;
		};
		if (body.encoding !== 'base64' || body.content === undefined) {
			throw new Error(`Unexpected contents response for ${path}@${ref} (encoding: ${body.encoding})`);
		}
		return Buffer.from(body.content, 'base64');
	}

	private async getJson(owner: string, repo: string, path: string): Promise<unknown> {
		const token = await this.auth.installationToken(owner, repo);
		const res = await fetch(`${this.apiBaseUrl}${path}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS),
			headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
		});
		if (!res.ok) throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
		return res.json();
	}
}
