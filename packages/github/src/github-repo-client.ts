
/** Every GitHub call is bounded; a black-holed connection must not hold a worker slot forever. */
const DEFAULT_API_TIMEOUT_MS = 30_000;
/** Tarballs of large repositories legitimately take minutes to stream. */
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 300_000;
/** GitHub's compare API pages 100 files at a time and never returns more than 300 in total. */
const COMPARE_PAGE_SIZE = 100;
export const COMPARE_FILE_CAP = 300;

export interface GitHubRepoClientTimeouts {
	apiMs?: number;
	downloadMs?: number;
}

/**
 * The diff between two commits touches at least GitHub's 300-file ceiling, so
 * a compare-based incremental sync would be incomplete. Callers must fall back
 * to a full re-ingest; advancing the cursor on a truncated diff silently and
 * permanently drops the files past the cut-off (that happened before this guard).
 */
export class CompareTooLargeError extends Error {
	constructor(readonly base: string, readonly head: string, readonly filesSeen: number) {
		super(`GitHub compare ${base.slice(0, 7)}...${head.slice(0, 7)} reaches the ${COMPARE_FILE_CAP}-file ceiling (${filesSeen} seen); the diff would be incomplete — re-ingest the repository instead`);
		this.name = 'CompareTooLargeError';
	}
}
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

	private readonly apiTimeoutMs: number;
	private readonly downloadTimeoutMs: number;

	constructor(
		private readonly auth: InstallationTokenSource,
		apiBaseUrl = 'https://api.github.com',
		timeouts: GitHubRepoClientTimeouts = {}
	) {
		this.apiBaseUrl = apiBaseUrl;
		this.apiTimeoutMs = timeouts.apiMs ?? DEFAULT_API_TIMEOUT_MS;
		this.downloadTimeoutMs = timeouts.downloadMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
	}

	async getHead(owner: string, repo: string): Promise<RepoHead> {
		const repoInfo = (await this.getJson(owner, repo, `/repos/${owner}/${repo}`)) as { default_branch: string };
		const commit = (await this.getJson(owner, repo, `/repos/${owner}/${repo}/commits/${repoInfo.default_branch}`)) as { sha: string };
		return { defaultBranch: repoInfo.default_branch, headSha: commit.sha };
	}

	/** Downloads the repo tarball at `ref`. GitHub responds with a redirect; fetch follows it. */
	async downloadTarball(owner: string, repo: string, ref: string): Promise<Buffer> {
		const token = await this.auth.installationToken(owner, repo);
		const res = await fetch(`${this.apiBaseUrl}/repos/${owner}/${repo}/tarball/${ref}`, { signal: AbortSignal.timeout(this.downloadTimeoutMs),
			headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
		});
		if (!res.ok) throw new Error(`Tarball download failed for ${owner}/${repo}@${ref}: ${res.status} ${await res.text()}`);
		return Buffer.from(await res.arrayBuffer());
	}

	/**
	 * Files changed between two commits (basis for incremental sync). Walks every
	 * page: a single page holds at most 100 files, and reading only the first one
	 * used to truncate any push touching more than that. Throws CompareTooLargeError
	 * once the 300-file ceiling is reached, since GitHub stops there and the rest of
	 * the diff is simply absent.
	 */
	async compare(owner: string, repo: string, base: string, head: string): Promise<ComparedFile[]> {
		const files: ComparedFile[] = [];
		for (let page = 1; ; page++) {
			const body = (await this.getJson(owner, repo, `/repos/${owner}/${repo}/compare/${base}...${head}?per_page=${COMPARE_PAGE_SIZE}&page=${page}`)) as {
				files?: Array<{ filename: string; status: ComparedFile['status']; previous_filename?: string }>;
			};
			const pageFiles = body.files ?? [];
			for (const f of pageFiles) files.push({ path: f.filename, status: f.status, previousPath: f.previous_filename });
			if (files.length >= COMPARE_FILE_CAP) throw new CompareTooLargeError(base, head, files.length);
			if (pageFiles.length < COMPARE_PAGE_SIZE) return files;
		}
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
		const res = await fetch(`${this.apiBaseUrl}${path}`, { signal: AbortSignal.timeout(this.apiTimeoutMs),
			headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
		});
		if (!res.ok) throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
		return res.json();
	}
}
