import { apiKeyEnvVarFor, embeddingProviderFromProfile, type Project } from '@meshify/data-access';
import type { PipelineRegistry } from '@meshify/rocketride-gateway';

export interface IngestTokenDeps {
	pipelineRegistry: PipelineRegistry;
	qdrantHost: string;
	qdrantPort: number;
	/** See QdrantTargetConfig.apiKey — required whenever RocketRide runs as a managed cloud service. */
	qdrantApiKey?: string;
}

/**
 * Resolves (and lazily starts) a project's RocketRide ingest pipeline for the
 * given target collection and returns its task token — the
 * embeddingProviderFromProfile + apiKeyEnvVarFor + ensureIngestPipeline block
 * that was copy-pasted across every ingest processor, parameterized by target.
 */
export async function resolveIngestToken(project: Project, target: 'documents' | 'code', chunkSize: number, deps: IngestTokenDeps): Promise<string> {
	const embeddingProvider = embeddingProviderFromProfile(project.embeddingProfile);
	const pipelineGuid = target === 'code' ? project.rocketrideCodeIngestPipelineId : project.rocketrideDocsIngestPipelineId;
	const collection = target === 'code' ? project.qdrantCollectionCode : project.qdrantCollectionDocs;

	return deps.pipelineRegistry.ensureIngestPipeline({
		pipelineGuid,
		target,
		qdrant: { host: deps.qdrantHost, port: deps.qdrantPort, collection, apiKey: deps.qdrantApiKey },
		embedding: {
			provider: embeddingProvider,
			profile: project.embeddingProfile,
			apiKeyEnvVar: embeddingProvider === 'openai' ? apiKeyEnvVarFor('openai') : undefined,
		},
		chunkSize,
	});
}
