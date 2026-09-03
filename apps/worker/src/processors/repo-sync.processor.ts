import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { apiKeyEnvVarFor, embeddingProviderFromProfile, parseGitHubUrl } from '@meshify/data-access';
import type { FileRepository, PipelineJobRepository, ProjectRepository, RepositoryRepository } from '@meshify/data-access';
import type { GitHubRepoClient } from '@meshify/github';
import { CompareTooLargeError } from '@meshify/github';
import type { JobEventPublisher, RepoSyncJobPayload } from '@meshify/queues';
import type { PipelineRegistry, RagPort } from '@meshify/rocketride-gateway';
import { detectLanguage, hashContent, isBinaryBuffer, isDeniedPath } from '@meshify/providers';
import { JobProgress } from './job-progress.js';

export interface RepoSyncProcessorDeps {
	repositories: RepositoryRepository;
	files: FileRepository;
	projects: ProjectRepository;
	pipelineJobs: PipelineJobRepository;
	github: GitHubRepoClient;
	pipelineRegistry: PipelineRegistry;
	rag: RagPort;
	jobEvents: JobEventPublisher;
	codeChunkSize: number;
	qdrantHost: string;
	qdrantPort: number;
	/** See QdrantTargetConfig.apiKey — required whenever RocketRide runs as a managed cloud service. */
	qdrantApiKey?: string;
}

/**
 * Incremental GitHub sync: compare last_synced_commit...HEAD, re-ingest only
 * changed files, and mark removed files 'deleted' in Postgres.
 *
 * Known limitation (deliberate, documented in DeadCodeReport/limitations):
 * stale Qdrant points for removed or superseded file versions are not yet
 * garbage-collected — that requires chunk/point tracking, which lands with
 * the reindex step. Retrieval quality degrades gracefully (stale chunks may
 * still be cited) rather than sync being blocked on it.
 */
export async function processRepoSyncJob(job: Job<RepoSyncJobPayload>, deps: RepoSyncProcessorDeps): Promise<void> {
	const { pipelineJobId, repositoryId, projectId } = job.data;
	const progress = new JobProgress(deps.pipelineJobs, deps.jobEvents, { jobId: pipelineJobId, projectId, jobType: 'sync_repo', title: 'Repository' });

	await deps.pipelineJobs.markRunning(pipelineJobId);

	try {
		const [repository, project] = await Promise.all([deps.repositories.findById(repositoryId), deps.projects.findById(projectId)]);
		if (!repository) throw new Error(`Repository "${repositoryId}" not found`);
		if (!project) throw new Error(`Project "${projectId}" not found`);
		if (repository.source !== 'github') throw new Error('Only GitHub repositories can be synced; re-upload the ZIP instead');
		if (!repository.remoteUrl) throw new Error('GitHub repository row has no remote_url');
		if (!repository.lastSyncedCommit) throw new Error('Repository has never completed a full ingest; run ingestion first');

		progress.setTitle(repository.remoteUrl);
		await progress.running('Checking for changes');

		const { owner, repo } = parseGitHubUrl(repository.remoteUrl);
		const head = await deps.github.getHead(owner, repo);

		if (head.headSha === repository.lastSyncedCommit) {
			await deps.repositories.markSynced(repositoryId, head.headSha, head.defaultBranch);
			await deps.pipelineJobs.markCompleted(pipelineJobId);
			await progress.completed(); // already up to date — a valid, complete outcome
			return;
		}

		await progress.stage('Comparing changes', 20);
		await deps.repositories.updateSyncStatus(repositoryId, 'cloning');
		let changes: Awaited<ReturnType<typeof deps.github.compare>>;
		try {
			changes = await deps.github.compare(owner, repo, repository.lastSyncedCommit, head.headSha);
		} catch (err) {
			// GitHub truncates diffs at 300 files. This legacy lane cannot re-ingest by
			// itself, so fail without touching the cursor (nothing is skipped) and say
			// what to do; the provider-platform sync lane falls back automatically.
			if (err instanceof CompareTooLargeError) throw new Error(`${err.message}. Run a full repository re-ingest; the sync cursor stays at ${repository.lastSyncedCommit}.`);
			throw err;
		}

		const removedPaths = changes.filter((c) => c.status === 'removed').map((c) => c.path);
		const renamedFromPaths = changes.filter((c) => c.status === 'renamed' && c.previousPath).map((c) => c.previousPath!);
		await deps.files.markDeleted(repositoryId, [...removedPaths, ...renamedFromPaths]);

		const changedPaths = changes.filter((c) => c.status !== 'removed' && c.status !== 'unchanged' && !isDeniedPath(c.path)).map((c) => c.path);

		if (changedPaths.length > 0) {
			const embeddingProvider = embeddingProviderFromProfile(project.embeddingProfile);
			const token = await deps.pipelineRegistry.ensureIngestPipeline({
				pipelineGuid: project.rocketrideCodeIngestPipelineId,
				target: 'code',
				qdrant: { host: deps.qdrantHost, port: deps.qdrantPort, collection: project.qdrantCollectionCode, apiKey: deps.qdrantApiKey },
				embedding: {
					provider: embeddingProvider,
					profile: project.embeddingProfile,
					apiKeyEnvVar: embeddingProvider === 'openai' ? apiKeyEnvVarFor('openai') : undefined,
				},
				chunkSize: deps.codeChunkSize,
			});

			for (let i = 0; i < changedPaths.length; i++) {
				const filePath = changedPaths[i]!;
				await progress.stage(`Uploading changed files (${i + 1}/${changedPaths.length})`, 40 + Math.round((i / changedPaths.length) * 55));
				let buffer: Buffer;
				try {
					buffer = await deps.github.getFileContent(owner, repo, filePath, head.headSha);
				} catch {
					// GitHub's contents API returns encoding:'none' (no inline content) for files >1MB;
					// skip the file — matching the initial scanner's size cap — instead of failing the whole sync.
					continue;
				}
				if (isBinaryBuffer(buffer)) continue;

				await deps.files.upsert({
					id: randomUUID(),
					projectId,
					repositoryId,
					path: filePath,
					language: detectLanguage(filePath),
					sizeBytes: buffer.byteLength,
					contentHash: hashContent(buffer),
				});

				const result = await deps.rag.ingestFiles(token, [{ path: filePath, buffer, mimeType: 'text/plain' }]);
				if (!result.completed) throw new Error(`Sync ingestion failed for ${filePath}: ${result.errors.join('; ')}`);
			}

			await progress.stage('Writing vectors', 97);
			await deps.files.updateStatusByRepository(repositoryId, 'pending', 'embedded');
		}

		await deps.repositories.markSynced(repositoryId, head.headSha, head.defaultBranch);
		await deps.pipelineJobs.markCompleted(pipelineJobId);
		await progress.completed();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await deps.repositories.updateSyncStatus(repositoryId, 'failed').catch(() => undefined);

		await deps.pipelineJobs.incrementAttempts(pipelineJobId);
		const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
		await deps.pipelineJobs.markFailed(pipelineJobId, message, isFinalAttempt ? 'dead_letter' : 'failed');
		await progress.failed(isFinalAttempt, message, job.attemptsMade + 1);

		throw err;
	}
}
