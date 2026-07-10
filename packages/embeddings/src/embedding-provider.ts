/**
 * Query-time embedding. Ingestion embeddings are produced by RocketRide inside
 * its pipelines; the search path needs to embed the user's query with the SAME
 * model so similarity scores are comparable. RocketRide exposes no raw
 * "embed this text" call to the SDK, so this is the one place we call an
 * embedding provider directly — always driven by the project's stored
 * embedding_profile, so it cannot drift from ingest.
 */
export interface EmbeddingProvider {
	/** The profile this provider was built for; callers assert it matches the project. */
	readonly profile: string;
	embed(text: string): Promise<number[]>;
}

export class UnsupportedEmbeddingProfileError extends Error {
	constructor(profile: string) {
		super(`Query embedding is not supported for embedding profile "${profile}" yet (only OpenAI text-embedding-* profiles). Search requires an OpenAI-embedded project.`);
		this.name = 'UnsupportedEmbeddingProfileError';
	}
}

export class MissingEmbeddingKeyError extends Error {
	constructor(profile: string) {
		super(`Project uses embedding profile "${profile}" but ROCKETRIDE_OPENAI_KEY is not configured, so queries cannot be embedded for search.`);
		this.name = 'MissingEmbeddingKeyError';
	}
}
