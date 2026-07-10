import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { apiKeyEnvVarFor, embeddingProviderFromProfile, parseGitHubUrl } from '@meshify/data-access';
import type { FileRepository, PipelineJobRepository, ProjectRepository, RepositoryRepository } from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { GitHubRepoClient } from '@meshify/github';
import type { RepoIngestJobPayload } from '@meshify/queues';
import type { IngestFile, PipelineRegistry, RagPort } from '@meshify/rocketride-gateway';
import { scanExtractedRepo, type ScannedFile } from '../repo/repo-scanner.js';
import { withExtractedArchive } from '../repo/archive-extractor.js';

export interface RepoIngestProcessorDeps {
	repositories: RepositoryRepository;
	files: FileRepository;
	projects: ProjectRepository;
	pipelineJobs: PipelineJobRepository;
	storage: ObjectStorageClient;
	github: GitHubRepoClient;
	pipelineRegistry: PipelineRegistry;
	rag: RagPort;
	/** 256-512 chars for code per RocketRide's chunk-sizing guidance. */
	codeChunkSize: number;
	qdrantHost: string;
	qdrantPort: number;
}

const SEND_BATCH_SIZE = 25;

/**
 * Full repository ingestion. Stage A (here): fetch the archive (GitHub App
 * tarball or uploaded ZIP from object storage), extract, filter binaries/
 * vendored dirs, detect languages, hash, and record files rows. Stage B:
 * stream the retained files through the project's RocketRide code-ingest
 * pipeline into the proj_<id>_code Qdrant collection.
 */
export async function processRepoIngestJob(job: Job<RepoIngestJobPayload>, deps: RepoIngestProcessorDeps): Promise<void> {
	const { pipelineJobId, repositoryId, projectId } = job.data;

	await deps.pipelineJobs.markRunning(pipelineJobId);

	try {
		const [repository, project] = await Promise.all([deps.repositories.findById(repositoryId), deps.projects.findById(projectId)]);
		if (!repository) throw new Error(`Repository "${repositoryId}" not found`);
		if (!project) throw new Error(`Project "${projectId}" not found`);

		await deps.repositories.updateSyncStatus(repositoryId, 'cloning');

		let archive: Buffer;
		let format: 'tar.gz' | 'zip';
		let headSha: string | null = null;
		let defaultBranch: string | null = null;

		if (repository.source === 'github') {
			if (!repository.remoteUrl) throw new Error('GitHub repository row has no remote_url');
			const { owner, repo } = parseGitHubUrl(repository.remoteUrl);
			const head = await deps.github.getHead(owner, repo);
			headSha = head.headSha;
			defaultBranch = head.defaultBranch;
			archive = await deps.github.downloadTarball(owner, repo, head.headSha);
			format = 'tar.gz';
		} else {
			if (!repository.archiveObjectKey) throw new Error('ZIP repository row has no archive_object_key');
			archive = await deps.storage.getObject(repository.archiveObjectKey);
			format = 'zip';
		}

		const scanned = await withExtractedArchive(archive, format, (dir) => scanExtractedRepo(dir));
		if (scanned.length === 0) throw new Error('Archive contained no ingestable source files after filtering');

		for (const file of scanned) {
			await deps.files.upsert({
				id: randomUUID(),
				projectId,
				repositoryId,
				path: file.path,
				language: file.language,
				sizeBytes: file.sizeBytes,
				contentHash: file.contentHash,
			});
		}

		const embeddingProvider = embeddingProviderFromProfile(project.embeddingProfile);
		const token = await deps.pipelineRegistry.ensureIngestPipeline({
			pipelineGuid: project.rocketrideCodeIngestPipelineId,
			target: 'code',
			qdrant: { host: deps.qdrantHost, port: deps.qdrantPort, collection: project.qdrantCollectionCode },
			embedding: {
				provider: embeddingProvider,
				profile: project.embeddingProfile,
				apiKeyEnvVar: embeddingProvider === 'openai' ? apiKeyEnvVarFor('openai') : undefined,
			},
			chunkSize: deps.codeChunkSize,
		});

		for (const batch of toBatches(scanned, SEND_BATCH_SIZE)) {
			const result = await deps.rag.ingestFiles(token, batch.map(toIngestFile));
			if (!result.completed) throw new Error(`Code ingestion reported errors: ${result.errors.join('; ')}`);
		}

		await deps.files.updateStatusByRepository(repositoryId, 'pending', 'embedded');
		await deps.repositories.markSynced(repositoryId, headSha, defaultBranch);
		await deps.pipelineJobs.markCompleted(pipelineJobId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await deps.repositories.updateSyncStatus(repositoryId, 'failed').catch(() => undefined);

		await deps.pipelineJobs.incrementAttempts(pipelineJobId);
		const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
		await deps.pipelineJobs.markFailed(pipelineJobId, message, isFinalAttempt ? 'dead_letter' : 'failed');

		throw err;
	}
}

function toIngestFile(file: ScannedFile): IngestFile {
	return { path: file.path, buffer: file.buffer, mimeType: 'text/plain' };
}

function toBatches<T>(items: T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
	return batches;
}
