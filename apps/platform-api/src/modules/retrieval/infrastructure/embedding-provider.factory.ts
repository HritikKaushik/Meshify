import { createEmbeddingProvider, type EmbeddingProvider } from '@meshify/embeddings';
import type { Project } from '@meshify/data-access';
import type { EmbeddingProviderFactory } from '../application/embedding-provider.port.js';

export class ConfiguredEmbeddingProviderFactory implements EmbeddingProviderFactory {
	constructor(private readonly openAiKey?: string) {}

	forProject(project: Project): EmbeddingProvider {
		return createEmbeddingProvider(project.embeddingProfile, { openAiKey: this.openAiKey });
	}
}
