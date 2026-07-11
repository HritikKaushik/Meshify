import type { Job } from 'bullmq';
import { apiKeyEnvVarFor, embeddingProviderFromProfile } from '@meshify/data-access';
import type { DocumentRepository, PipelineJobRepository, ProjectRepository } from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { DocumentIngestJobPayload } from '@meshify/queues';
import type { PipelineRegistry, RagPort } from '@meshify/rocketride-gateway';

export interface DocumentIngestProcessorDeps {
	documents: DocumentRepository;
	projects: ProjectRepository;
	pipelineJobs: PipelineJobRepository;
	storage: ObjectStorageClient;
	pipelineRegistry: PipelineRegistry;
	rag: RagPort;
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

	await deps.pipelineJobs.markRunning(pipelineJobId);

	try {
		const [document, project] = await Promise.all([deps.documents.findById(documentId), deps.projects.findById(projectId)]);
		if (!document) throw new Error(`Document "${documentId}" not found`);
		if (!project) throw new Error(`Project "${projectId}" not found`);

		const buffer = await deps.storage.getObject(document.objectStorageKey);

		const embeddingProvider = embeddingProviderFromProfile(project.embeddingProfile);

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

		const result = await deps.rag.ingestFiles(token, [{ path: document.filename, buffer, mimeType: undefined }]);

		if (!result.completed) {
			throw new Error(`Ingestion reported errors: ${result.errors.join('; ')}`);
		}

		await deps.documents.updateStatus(documentId, 'embedded');
		await deps.pipelineJobs.markCompleted(pipelineJobId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await deps.documents.updateStatus(documentId, 'failed').catch(() => undefined);

		await deps.pipelineJobs.incrementAttempts(pipelineJobId);
		// job.attemptsMade is BullMQ's own 1-indexed attempt counter for this run — trust it over a
		// separately-maintained count to avoid drift between the two retry bookkeepers.
		const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
		await deps.pipelineJobs.markFailed(pipelineJobId, message, isFinalAttempt ? 'dead_letter' : 'failed');

		throw err; // rethrow so BullMQ applies its own retry/backoff bookkeeping
	}
}
