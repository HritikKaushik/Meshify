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
}

export interface ProjectPipelineConfig {
	/** Literal UUID for this specific .pipe file's `project_id` field (RocketRide requirement, not our platform project id). */
	pipelineGuid: string;
	embedding: EmbeddingProviderConfig;
	/** RecursiveCharacterTextSplitter chunk size in chars. 512-1024 for prose, 256-512 for code. */
	chunkSize: number;
}

/** Ingest pipelines have no LLM node (webhook -> parse -> chunk -> embed -> store), so no LLM config is accepted. */
export interface IngestPipelineConfig extends ProjectPipelineConfig {
	target: IngestTarget;
	qdrant: QdrantTargetConfig;
}

export interface ChatPipelineConfig extends ProjectPipelineConfig {
	llm: LlmProviderConfig;
	docsCollection: QdrantTargetConfig;
	codeCollection: QdrantTargetConfig;
	systemInstructions: string[];
}
