import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { apiKeyEnvVarFor, embeddingProviderFromProfile, parseGitHubUrl } from '@meshify/data-access';
import type { FileRepository, PipelineJobRepository, ProjectRepository, RepositoryRepository } from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { GitHubRepoClient } from '@meshify/github';
import type { JobEventPublisher, RepoIngestJobPayload } from '@meshify/queues';
import type { IngestFile, PipelineRegistry, RagPort } from '@meshify/rocketride-gateway';
import { scanExtractedRepo, withDownloadedTarball, withExtractedArchive } from '@meshify/providers';
import { repositoryLockKey, withExecutionLock, type ExecutionLock } from '../execution-lock.js';
import { JobProgress } from './job-progress.js';

export interface RepoIngestProcessorDeps {
	repositories: RepositoryRepository;
	files: FileRepository;
	projects: ProjectRepository;
	pipelineJobs: PipelineJobRepository;
	storage: ObjectStorageClient;
	github: GitHubRepoClient;
	pipelineRegistry: PipelineRegistry;
	rag: RagPort;
	jobEvents: JobEventPublisher;
	/** 256-512 chars for code per RocketRide's chunk-sizing guidance. */
	codeChunkSize: number;
	qdrantHost: string;
	qdrantPort: number;
	/** See QdrantTargetConfig.apiKey — required whenever RocketRide runs as a managed cloud service. */
	qdrantApiKey?: string;
	/** Serializes ingest/sync per repository across worker replicas (see withExecutionLock). */
	lock: ExecutionLock;
}

const SEND_BATCH_SIZE = 25;

/**
 * Full repository ingestion. Stage A (here): fetch the archive (GitHub App
 * tarball or uploaded ZIP from object storage), extract, filter binaries/
 * vendored dirs, detect languages, hash, and record files rows. Stage B:
 * stream the retained files through the project's RocketRide code-ingest
 * pipeline into the proj_<id>_code Qdrant collection.
 */
export async function processRepoIngestJob(job: Job<RepoIngestJobPayload>, deps: RepoIngestProcessorDeps, token?: string): Promise<void> {
	return withExecutionLock(job, token, deps.lock, repositoryLockKey(job.data.repositoryId), () => runRepoIngest(job, deps));
}

async function runRepoIngest(job: Job<RepoIngestJobPayload>, deps: RepoIngestProcessorDeps): Promise<void> {
	const { pipelineJobId, repositoryId, projectId } = job.data;
	const progress = new JobProgress(deps.pipelineJobs, deps.jobEvents, { jobId: pipelineJobId, projectId, jobType: 'clone_repo', title: 'Repository' });

	await deps.pipelineJobs.markRunning(pipelineJobId);

	try {
		const [repository, project] = await Promise.all([deps.repositories.findById(repositoryId), deps.projects.findById(projectId)]);
		if (!repository) throw new Error(`Repository "${repositoryId}" not found`);
		if (!project) throw new Error(`Project "${projectId}" not found`);

		progress.setTitle(repository.remoteUrl ?? 'Uploaded archive');
		await progress.running('Downloading repository');
		await deps.repositories.updateSyncStatus(repositoryId, 'cloning');

		let headSha: string | null = null;
		let defaultBranch: string | null = null;

		// The archive goes to disk, and file contents are read one batch at a
		// time while the extracted tree is still there: a large repository is
		// bounded by disk and the extraction budget, not by this process's heap.
		await progress.stage('Downloading repository', 10);
		let withTree: <T>(use: (dir: string) => Promise<T>) => Promise<T>;
		if (repository.source === 'github') {
			if (!repository.remoteUrl) throw new Error('GitHub repository row has no remote_url');
			const { owner, repo } = parseGitHubUrl(repository.remoteUrl);
			const head = await deps.github.getHead(owner, repo);
			headSha = head.headSha;
			defaultBranch = head.defaultBranch;
			withTree = (use) => withDownloadedTarball((destination) => deps.github.downloadTarballToFile(owner, repo, head.headSha, destination), use);
		} else {
			if (!repository.archiveObjectKey) throw new Error('ZIP repository row has no archive_object_key');
			const archive = await deps.storage.getObject(repository.archiveObjectKey);
			withTree = (use) => withExtractedArchive(archive, 'zip', use);
		}

		await withTree(async (dir) => {
			await progress.stage('Scanning repository', 30);
			const scanned = await scanExtractedRepo(dir);
			if (scanned.length === 0) throw new Error('Archive contained no ingestable source files after filtering');

			await progress.stage('Preparing batches', 40);
			await deps.files.upsertMany(
				scanned.map((file) => ({
					id: randomUUID(),
					projectId,
					repositoryId,
					path: file.path,
					language: file.language,
					sizeBytes: file.sizeBytes,
					contentHash: file.contentHash,
				}))
			);

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

			// Uploading + embedding is the bulk of the work — report real progress across batches (45% → 95%).
			const batches = toBatches(scanned, SEND_BATCH_SIZE);
			for (let i = 0; i < batches.length; i++) {
				await progress.stage(`Uploading to RocketRide (${i + 1}/${batches.length})`, 45 + Math.round((i / batches.length) * 50));
				const files: IngestFile[] = [];
				for (const file of batches[i]!) files.push({ path: file.path, buffer: await file.read(), mimeType: 'text/plain' });
				const result = await deps.rag.ingestFiles(token, files);
				if (!result.completed) throw new Error(`Code ingestion reported errors: ${result.errors.join('; ')}`);
			}
		});

		await progress.stage('Writing vectors', 97);
		await deps.files.updateStatusByRepository(repositoryId, 'pending', 'embedded');
		await deps.repositories.markSynced(repositoryId, headSha, defaultBranch);
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

function toBatches<T>(items: T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
	return batches;
}
