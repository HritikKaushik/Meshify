export type LlmProvider = 'openai' | 'gemini';
export type EmbeddingProvider = 'openai' | 'transformer';
export type IngestTarget = 'documents' | 'code';

/** RocketRide LLM component ids the gateway can target. All share `questions → answers` lane wiring. */
export type LlmComponent = 'llm_openai' | 'llm_anthropic' | 'llm_gemini' | 'llm_openai_api' | 'llm_ollama';

/**
 * The legacy "managed" LLM config: a named profile whose api key RocketRide
 * substitutes from ITS OWN environment (`${ROCKETRIDE_*}`). This is the fallback
 * used when no org-level active provider is configured, so existing OpenAI /
 * Gemini workflows keep working byte-for-byte.
 */
export interface ManagedLlmConfig {
	mode?: 'managed';
	provider: LlmProvider;
	/** Exact `profile` value from the RocketRide component catalog, e.g. "openai-5", "gemini-2_0-flash". */
	profile: string;
	/** `${ROCKETRIDE_*}` variable name holding the provider API key. */
	apiKeyEnvVar: string;
}

/**
 * A resolved BYOA config produced by the AI Provider subsystem's resolution
 * layer: a chosen component + model and (for keyed providers) a LITERAL api key
 * pulled from the vault. Emitted as a `custom`-profile component so RocketRide
 * runs the org's chosen vendor without ever knowing which one it is.
 */
export interface ResolvedLlmConfig {
	mode: 'resolved';
	component: LlmComponent;
	model: string;
	modelTotalTokens: number;
	/** Literal API key. Omitted for keyless providers (e.g. Ollama). */
	apiKey?: string;
	/** `base_url` (llm_openai_api) or `serverbase` (llm_ollama). */
	baseUrl?: string;
	/** Extra `custom`-profile fields, e.g. Gemini `outputTokens`, Ollama `temperature`/`reasoning_effort`. */
	extra?: Record<string, unknown>;
}

export type LlmProviderConfig = ManagedLlmConfig | ResolvedLlmConfig;

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

/**
 * Deliberately NOT a ProjectPipelineConfig: chat no longer does retrieval
 * inside the RocketRide pipeline (see chat-pipeline.ts) — the platform embeds
 * already-retrieved context into the question text itself, so RocketRide only
 * ever runs a bare LLM call for chat.
 */
export interface ChatPipelineConfig {
	pipelineGuid: string;
	llm: LlmProviderConfig;
}
