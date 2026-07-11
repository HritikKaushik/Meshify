export type LlmProvider = 'openai' | 'gemini';
export type EmbeddingProvider = 'openai' | 'transformer';
export type IngestTarget = 'documents' | 'code';

export interface LlmProviderConfig {
	provider: LlmProvider;
	/** Exact `profile` value from the RocketRide component catalog, e.g. "openai-5", "gemini-2_0-flash". */
	profile: string;
	/** `${ROCKETRIDE_*}` variable name holding the provider API key. */
	apiKeyEnvVar: string;
}

export interface EmbeddingProviderConfig {
	provider: EmbeddingProvider;
	/** Exact `profile` value, e.g. "text-embedding-3-large", "miniLM". Must match at ingest AND query time. */
	profile: string;
	apiKeyEnvVar?: string;
}

export interface QdrantTargetConfig {
	host: string;
	port: number;
	collection: string;
	scoreThreshold?: number;
	/**
	 * Set only when Qdrant must be reached over the network with auth — e.g.
	 * Qdrant Cloud, or any deployment where RocketRide's engine is NOT
	 * co-located with Qdrant. This is required whenever RocketRide runs as a
	 * managed cloud service: "host" values like "localhost" or a Docker
	 * network hostname resolve on RocketRide's infrastructure, not ours, and
	 * are unreachable from there. Presence of this field switches the qdrant
	 * node to RocketRide's "cloud" profile instead of "local".
	 */
	apiKey?: string;
}

export interface ProjectPipelineConfig {
	/** Literal UUID for this specific .pipe file's `project_id` field (RocketRide requirement, not our platform project id). */
	pipelineGuid: string;
	embedding: EmbeddingProviderConfig;
}

/** Ingest pipelines have no LLM node (webhook -> parse -> chunk -> embed -> store), so no LLM config is accepted. */
export interface IngestPipelineConfig extends ProjectPipelineConfig {
	target: IngestTarget;
	qdrant: QdrantTargetConfig;
	/** RecursiveCharacterTextSplitter chunk size in chars. 512-1024 for prose, 256-512 for code. Chat pipelines have no preprocessor, so this lives here. */
	chunkSize: number;
}

export interface ChatPipelineConfig extends ProjectPipelineConfig {
	llm: LlmProviderConfig;
	docsCollection: QdrantTargetConfig;
	codeCollection: QdrantTargetConfig;
	systemInstructions: string[];
}
