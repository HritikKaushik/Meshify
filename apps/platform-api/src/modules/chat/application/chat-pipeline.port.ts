import type { Project } from '@meshify/data-access';

/**
 * Resolves a project's persistent RocketRide chat pipeline to a running task
 * token. Application-layer port so AskQuestionUseCase can be unit-tested
 * without RocketRide; implemented in infrastructure via PipelineRegistry.
 */
export interface ChatPipelineResolver {
	resolve(project: Project): Promise<string>;
	/** Drops any cached token for this project's chat pipeline, forcing the next resolve() to re-establish it. */
	invalidate(project: Project): void;
}
