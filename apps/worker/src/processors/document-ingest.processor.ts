import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { apiKeyEnvVarFor, embeddingProviderFromProfile } from '@meshify/data-access';
import type { DocumentRepository, PipelineJobRepository, ProjectRepository } from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { DocumentIngestJobPayload, JobEventPublisher } from '@meshify/queues';
import type { PipelineRegistry, RagPort } from '@meshify/rocketride-gateway';
import { JobProgress } from './job-progress.js';

export interface DocumentIngestProcessorDeps {
	documents: DocumentRepository;
	projects: ProjectRepository;
	pipelineJobs: PipelineJobRepository;
	storage: ObjectStorageClient;
	pipelineRegistry: PipelineRegistry;
	rag: RagPort;
	jobEvents: JobEventPublisher;
	/** RecursiveCharacterTextSplitter size for prose documents — see chunk-sizing guidance in ROCKETRIDE_PIPELINE_RULES.md. */
	documentChunkSize: number;
	qdrantHost: string;
	qdrantPort: number;
	/** See QdrantTargetConfig.apiKey — required whenever RocketRide runs as a managed cloud service. */
	qdrantApiKey?: string;
}

/**
 * webhook -> parse -> preprocessor_langchain -> embedding -> qdrant, via the
 * project's docs-ingest pipeline. Downloads the raw upload from object
 * storage, resolves (and lazily starts, if not already running) the
 * project's RocketRide ingest pipeline, and sends the file through it.
 */
export async function processDocumentIngestJob(job: Job<DocumentIngestJobPayload>, deps: DocumentIngestProcessorDeps): Promise<void> {
	const { pipelineJobId, documentId, projectId } = job.data;
	const progress = new JobProgress(deps.pipelineJobs, deps.jobEvents, { jobId: pipelineJobId, projectId, jobType: 'ingest_document', title: 'Document' });

	await deps.pipelineJobs.markRunning(pipelineJobId);

	try {
		const [document, project] = await Promise.all([deps.documents.findById(documentId), deps.projects.findById(projectId)]);
		if (!document) throw new Error(`Document "${documentId}" not found`);
		if (!project) throw new Error(`Project "${projectId}" not found`);

		progress.setTitle(document.filename);
		await progress.running('Uploading');

		await progress.stage('Extracting content', 15);
		const buffer = await deps.storage.getObject(document.objectStorageKey);

		// Integrity gate: the bytes are hashed at upload (document.contentHash). If what
		// we just pulled from object storage doesn't match, the corruption is in
		// storage/retrieval (not downstream in RocketRide) — fail loudly and precisely
		// here rather than letting a mangled file surface as an opaque parser decode error.
		const retrievedHash = createHash('sha256').update(buffer).digest('hex');
		if (retrievedHash !== document.contentHash) {
			throw new Error(
				`Object-storage integrity check failed for ${document.objectStorageKey}: retrieved bytes ` +
					`(sha256 ${retrievedHash.slice(0, 12)}…, head ${buffer.subarray(0, 4).toString('hex')}, ${buffer.byteLength}B) ` +
					`do not match the upload hash ${document.contentHash.slice(0, 12)}…. Corruption is in storage/retrieval, not RocketRide.`
			);
		}

		const embeddingProvider = embeddingProviderFromProfile(project.embeddingProfile);

		await progress.stage('Chunking', 35);
		const token = await deps.pipelineRegistry.ensureIngestPipeline({
			pipelineGuid: project.rocketrideDocsIngestPipelineId,
			target: 'documents',
			qdrant: { host: deps.qdrantHost, port: deps.qdrantPort, collection: project.qdrantCollectionDocs, apiKey: deps.qdrantApiKey },
			embedding: {
				provider: embeddingProvider,
				profile: project.embeddingProfile,
				apiKeyEnvVar: embeddingProvider === 'openai' ? apiKeyEnvVarFor('openai') : undefined,
			},
			chunkSize: deps.documentChunkSize,
		});

		await progress.stage('Embedding', 60);
		const result = await deps.rag.ingestFiles(token, [{ path: document.filename, buffer, mimeType: undefined }]);

		if (!result.completed) {
			throw new Error(`Ingestion reported errors: ${result.errors.join('; ')}`);
		}

		await progress.stage('Writing vectors', 95);
		await deps.documents.updateStatus(documentId, 'embedded');
		await deps.pipelineJobs.markCompleted(pipelineJobId);
		await progress.completed();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await deps.documents.updateStatus(documentId, 'failed').catch(() => undefined);

		await deps.pipelineJobs.incrementAttempts(pipelineJobId);
		// job.attemptsMade is BullMQ's own 1-indexed attempt counter for this run — trust it over a
		// separately-maintained count to avoid drift between the two retry bookkeepers.
		const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
		await deps.pipelineJobs.markFailed(pipelineJobId, message, isFinalAttempt ? 'dead_letter' : 'failed');
		await progress.failed(isFinalAttempt, message, job.attemptsMade + 1);

		throw err; // rethrow so BullMQ applies its own retry/backoff bookkeeping
	}
}
