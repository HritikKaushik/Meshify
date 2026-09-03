import type { Repository } from '@meshify/data-access';
import { parseGitHubUrl } from '@meshify/data-access';
import { CompareTooLargeError } from '@meshify/github';
import type { IntegrationContext } from '../base/context.js';
import type { KnowledgeItem, KnowledgeSink } from '../base/knowledge.js';
import type { SyncContext } from '../base/sync.js';
import { ProviderConfigError } from '../base/errors.js';
import { detectLanguage, hashContent, isBinaryBuffer, isDeniedPath, scanExtractedRepo, type ScannedFile } from './archive/repo-scanner.js';
import { withExtractedArchive } from './archive/archive-extractor.js';

/** Token-parameterized read transport (structural over GitHubRepoClient). */
export interface GitHubRepoTransport {
	getHead(owner: string, repo: string): Promise<{ defaultBranch: string; headSha: string }>;
	downloadTarball(owner: string, repo: string, ref: string): Promise<Buffer>;
	compare(owner: string, repo: string, base: string, head: string): Promise<Array<{ path: string; status: string; previousPath?: string }>>;
	getFileContent(owner: string, repo: string, path: string, ref: string): Promise<Buffer>;
}

/** Detail persistence the sync needs — structural subsets of the data-access ports, wired by the worker. */
export interface GitHubSyncDeps {
	repos: {
		findByConnectorId(connectorId: string): Promise<Repository | undefined>;
		updateSyncStatus(id: string, status: 'pending' | 'cloning' | 'synced' | 'failed'): Promise<void>;
		markSynced(id: string, commitSha: string | null, defaultBranch: string | null): Promise<void>;
		updateGitHubIdentity(id: string, input: { githubRepoId?: string; owner?: string; name?: string }): Promise<void>;
	};
	files: {
		upsert(input: { id: string; projectId: string; repositoryId: string; path: string; language: string | null; sizeBytes: number; contentHash: string }): Promise<unknown>;
		markDeleted(repositoryId: string, paths: string[]): Promise<void>;
		/** Lets a full sync retire rows (and vectors) for files no longer in the tree. Optional for callers that cannot list. */
		listByRepository?(repositoryId: string): Promise<Array<{ path: string; status: string }>>;
	};
	/** Builds the token-bearing transport for one integration (vault-backed installation token). */
	repoTransport(ctx: IntegrationContext): GitHubRepoTransport;
	/** Injectable archive → scanned-files step (real tarball extraction by default). */
	scanArchive?: (archive: Buffer, format: 'tar.gz' | 'zip') => Promise<ScannedFile[]>;
	generateId: () => string;
}

/**
 * GitHub content sync behind SyncCapable. The provider decides what to fetch
 * (full tarball vs compare-diff) and maintains its detail rows (files,
 * repository sync state); skip/purge/batch/embed bookkeeping belongs to the
 * ConnectorEngine behind the sink. Legacy sourceRefs (bare repo-relative
 * paths) are preserved — re-embedding everything to rename refs buys nothing.
 */
export async function executeGitHubSync(deps: GitHubSyncDeps, ctx: SyncContext, sink: KnowledgeSink): Promise<void> {
	const repository = await deps.repos.findByConnectorId(ctx.connector.id);
	if (!repository) throw new ProviderConfigError(`Connector "${ctx.connector.id}" has no repository row`);
	if (repository.source !== 'github') throw new ProviderConfigError('Only GitHub repositories sync through the github provider');

	const { owner, name } = repoIdentity(repository);
	const transport = deps.repoTransport(ctx);

	sink.progress('Checking repository', 5);
	const head = await transport.getHead(owner, name);
	if (!repository.owner || !repository.name) {
		await deps.repos.updateGitHubIdentity(repository.id, { owner, name });
	}

	try {
		if (ctx.mode === 'incremental') {
			await incrementalSync(deps, ctx, sink, { repository, owner, name, head });
		} else {
			await fullSync(deps, ctx, sink, { repository, owner, name, head });
		}
	} catch (err) {
		// Clear the transient 'cloning' status on failure so a dead-lettered
		// sync doesn't leave the repository showing a perpetual spinner while its
		// connector reads 'error'. Best-effort — never mask the original error.
		await deps.repos.updateSyncStatus(repository.id, 'failed').catch(() => undefined);
		throw err;
	}
}

function repoIdentity(repository: Repository): { owner: string; name: string } {
	if (repository.owner && repository.name) return { owner: repository.owner, name: repository.name };
	if (!repository.remoteUrl) throw new ProviderConfigError('GitHub repository row has neither owner/name nor remote_url');
	const parsed = parseGitHubUrl(repository.remoteUrl);
	return { owner: parsed.owner, name: parsed.repo };
}

interface SyncTarget {
	repository: Repository;
	owner: string;
	name: string;
	head: { defaultBranch: string; headSha: string };
}

async function fullSync(deps: GitHubSyncDeps, ctx: SyncContext, sink: KnowledgeSink, target: SyncTarget): Promise<void> {
	const { repository, owner, name, head } = target;
	const transport = deps.repoTransport(ctx);

	sink.progress('Downloading repository', 10);
	await deps.repos.updateSyncStatus(repository.id, 'cloning');
	const archive = await transport.downloadTarball(owner, name, head.headSha);

	sink.progress('Scanning repository', 30);
	const scan = deps.scanArchive ?? ((buffer, format) => withExtractedArchive(buffer, format, (dir) => scanExtractedRepo(dir)));
	const scanned = await scan(archive, 'tar.gz');
	if (scanned.length === 0) throw new Error('Archive contained no ingestable source files after filtering');

	sink.progress('Recording files', 40);
	for (const file of scanned) {
		await deps.files.upsert({
			id: deps.generateId(),
			projectId: repository.projectId,
			repositoryId: repository.id,
			path: file.path,
			language: file.language,
			sizeBytes: file.sizeBytes,
			contentHash: file.contentHash,
		});
	}

	sink.progress('Embedding repository', 50);
	await sink.upsert(scanned.map((file) => toItem(file.path, file.buffer, file.contentHash, file.language)));

	// Files that left the tree since the last sync: retire their rows and purge
	// their vectors, so a full re-ingest (also the fallback for oversized diffs)
	// never leaves deleted files citable.
	if (deps.files.listByRepository) {
		const present = new Set(scanned.map((file) => file.path));
		const gone = (await deps.files.listByRepository(repository.id)).filter((row) => row.status !== 'deleted' && !present.has(row.path)).map((row) => row.path);
		if (gone.length > 0) {
			await deps.files.markDeleted(repository.id, gone);
			await sink.remove(gone);
		}
	}

	// Cursor commit strictly after the embed barrier — a failed flush must retry
	// from the previous commit, never skip content.
	await sink.flush();
	await deps.repos.markSynced(repository.id, head.headSha, head.defaultBranch);
}

async function incrementalSync(deps: GitHubSyncDeps, ctx: SyncContext, sink: KnowledgeSink, target: SyncTarget): Promise<void> {
	const { repository, owner, name, head } = target;
	if (!repository.lastSyncedCommit) throw new Error('Repository has never completed a full ingest; run ingestion first');

	if (head.headSha === repository.lastSyncedCommit) {
		await deps.repos.markSynced(repository.id, head.headSha, head.defaultBranch);
		return; // already up to date — a valid, complete outcome
	}

	sink.progress('Comparing changes', 20);
	await deps.repos.updateSyncStatus(repository.id, 'cloning');
	const transport = deps.repoTransport(ctx);
	let changes: Awaited<ReturnType<GitHubRepoTransport['compare']>>;
	try {
		changes = await transport.compare(owner, name, repository.lastSyncedCommit, head.headSha);
	} catch (err) {
		if (err instanceof CompareTooLargeError) {
			// The diff is truncated by GitHub; syncing it would silently drop files
			// past the cut-off and then advance the cursor over them. Re-ingest.
			sink.progress('Too many changes for an incremental sync — re-ingesting the repository', 25);
			await fullSync(deps, ctx, sink, target);
			return;
		}
		throw err;
	}

	const removedPaths = changes.filter((c) => c.status === 'removed').map((c) => c.path);
	const renamedFromPaths = changes.filter((c) => c.status === 'renamed' && c.previousPath).map((c) => c.previousPath!);
	const goneRefs = [...removedPaths, ...renamedFromPaths];
	if (goneRefs.length > 0) {
		await deps.files.markDeleted(repository.id, goneRefs);
		// The engine purges the stale vectors — removed files no longer linger as citable chunks.
		await sink.remove(goneRefs);
	}

	const changedPaths = changes.filter((c) => c.status !== 'removed' && c.status !== 'unchanged' && !isDeniedPath(c.path)).map((c) => c.path);
	for (let i = 0; i < changedPaths.length; i++) {
		const filePath = changedPaths[i]!;
		sink.progress(`Syncing changed files (${i + 1}/${changedPaths.length})`, 40 + Math.round((i / Math.max(changedPaths.length, 1)) * 55));

		let buffer: Buffer;
		try {
			buffer = await transport.getFileContent(owner, name, filePath, head.headSha);
		} catch {
			// GitHub's contents API returns no inline content for files >1MB;
			// skip — matching the initial scanner's size cap — instead of failing the sync.
			continue;
		}
		if (isBinaryBuffer(buffer)) continue;

		const contentHash = hashContent(buffer);
		await deps.files.upsert({
			id: deps.generateId(),
			projectId: repository.projectId,
			repositoryId: repository.id,
			path: filePath,
			language: detectLanguage(filePath),
			sizeBytes: buffer.byteLength,
			contentHash,
		});
		await sink.upsert([toItem(filePath, buffer, contentHash, detectLanguage(filePath))]);
	}

	await sink.flush();
	await deps.repos.markSynced(repository.id, head.headSha, head.defaultBranch);
}

function toItem(path: string, buffer: Buffer, contentHash: string, language: string | null): KnowledgeItem {
	return { sourceRef: path, target: 'code', content: buffer, mimeType: 'text/plain', contentHash, metadata: language ? { language } : undefined };
}
