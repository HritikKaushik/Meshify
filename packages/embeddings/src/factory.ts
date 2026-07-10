import type { EmbeddingProvider } from './embedding-provider.js';
import { MissingEmbeddingKeyError, UnsupportedEmbeddingProfileError } from './embedding-provider.js';
import { OpenAiEmbeddingProvider, isOpenAiEmbeddingProfile } from './openai-embedding-provider.js';

export interface EmbeddingKeys {
	openAiKey?: string;
}

/** Builds the query-embedding provider for a project's embedding_profile, or throws a typed error the API can map to a clear status. */
export function createEmbeddingProvider(profile: string, keys: EmbeddingKeys): EmbeddingProvider {
	if (isOpenAiEmbeddingProfile(profile)) {
		if (!keys.openAiKey) throw new MissingEmbeddingKeyError(profile);
		return new OpenAiEmbeddingProvider(profile, keys.openAiKey);
	}
	throw new UnsupportedEmbeddingProfileError(profile);
}
