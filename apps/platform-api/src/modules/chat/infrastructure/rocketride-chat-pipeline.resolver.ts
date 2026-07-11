import { apiKeyEnvVarFor, embeddingProviderFromProfile, llmProviderFromProfile, type Project } from '@meshify/data-access';
import type { PipelineRegistry } from '@meshify/rocketride-gateway';
import type { ChatPipelineResolver } from '../application/chat-pipeline.port.js';

export class RocketRideChatPipelineResolver implements ChatPipelineResolver {
	constructor(
		private readonly registry: PipelineRegistry,
		private readonly qdrantHost: string,
		private readonly qdrantPort: number,
		/** Set when Qdrant needs cloud auth (see QdrantTargetConfig.apiKey) — required whenever RocketRide runs as a managed cloud service. */
		private readonly qdrantApiKey?: string
	) {}

	async resolve(project: Project): Promise<string> {
		const llmProvider = llmProviderFromProfile(project.llmProfile);
		const embeddingProvider = embeddingProviderFromProfile(project.embeddingProfile);

		return this.registry.ensureChatPipeline({
			pipelineGuid: project.rocketrideChatPipelineId,
			llm: { provider: llmProvider, profile: project.llmProfile, apiKeyEnvVar: apiKeyEnvVarFor(llmProvider) },
			embedding: {
				provider: embeddingProvider,
				profile: project.embeddingProfile,
				apiKeyEnvVar: embeddingProvider === 'openai' ? apiKeyEnvVarFor('openai') : undefined,
			},
			docsCollection: { host: this.qdrantHost, port: this.qdrantPort, collection: project.qdrantCollectionDocs, apiKey: this.qdrantApiKey },
			codeCollection: { host: this.qdrantHost, port: this.qdrantPort, collection: project.qdrantCollectionCode, apiKey: this.qdrantApiKey },
			systemInstructions: [], // empty -> pipeline-builder applies the grounding/anti-injection defaults
		});
	}
}
