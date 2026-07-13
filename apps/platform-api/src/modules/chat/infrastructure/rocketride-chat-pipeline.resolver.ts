import { apiKeyEnvVarFor, llmProviderFromProfile, type Project } from '@meshify/data-access';
import type { PipelineRegistry } from '@meshify/rocketride-gateway';
import type { ChatPipelineResolver } from '../application/chat-pipeline.port.js';

/**
 * Resolves a project's chat pipeline to a running task token. Retrieval no
 * longer happens inside this pipeline (see chat-pipeline.ts / ChatContextRetriever),
 * so it only needs the project's LLM profile — no Qdrant target at all.
 */
export class RocketRideChatPipelineResolver implements ChatPipelineResolver {
	constructor(private readonly registry: PipelineRegistry) {}

	async resolve(project: Project): Promise<string> {
		const llmProvider = llmProviderFromProfile(project.llmProfile);

		return this.registry.ensureChatPipeline({
			pipelineGuid: project.rocketrideChatPipelineId,
			llm: { provider: llmProvider, profile: project.llmProfile, apiKeyEnvVar: apiKeyEnvVarFor(llmProvider) },
		});
	}

	invalidate(project: Project): void {
		this.registry.invalidate(project.rocketrideChatPipelineId, 'chat');
	}
}
