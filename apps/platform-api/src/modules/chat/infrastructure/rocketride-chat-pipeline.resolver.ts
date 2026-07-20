import { apiKeyEnvVarFor, llmProviderFromProfile, type Project } from '@meshify/data-access';
import type { ManagedLlmConfig, PipelineRegistry } from '@meshify/rocketride-gateway';
import type { ChatPipelineResolver } from '../application/chat-pipeline.port.js';
import type { LlmResolutionService } from '../../llm-providers/infrastructure/llm-resolution.service.js';

/**
 * Resolves a project's chat pipeline to a running task token. The LLM node is
 * now provider-agnostic:
 *
 *  1. If the org has an ACTIVE AI provider, its resolved config (component +
 *     model + literal vault key) is injected — RocketRide runs the chosen vendor
 *     without knowing which one it is.
 *  2. Otherwise it falls back to the managed OpenAI/Gemini profile from the
 *     project, byte-identical to the previous behavior — so existing workflows
 *     keep working with no configuration.
 *
 * Retrieval no longer happens inside this pipeline (see chat-pipeline.ts /
 * ChatContextRetriever), so it only needs the LLM config — no Qdrant target.
 */
export class RocketRideChatPipelineResolver implements ChatPipelineResolver {
	constructor(
		private readonly registry: PipelineRegistry,
		private readonly resolution?: LlmResolutionService
	) {}

	async resolve(project: Project): Promise<string> {
		const resolved = this.resolution ? await this.resolution.resolveForOrg(project.orgId) : null;
		return this.registry.ensureChatPipeline({
			pipelineGuid: project.rocketrideChatPipelineId,
			llm: resolved ?? this.managedFallback(project),
		});
	}

	invalidate(project: Project): void {
		this.registry.invalidate(project.rocketrideChatPipelineId, 'chat');
	}

	/** The pre-BYOA default: the project's managed profile + `${ROCKETRIDE_*}` env key. */
	private managedFallback(project: Project): ManagedLlmConfig {
		const llmProvider = llmProviderFromProfile(project.llmProfile);
		return { provider: llmProvider, profile: project.llmProfile, apiKeyEnvVar: apiKeyEnvVarFor(llmProvider) };
	}
}
