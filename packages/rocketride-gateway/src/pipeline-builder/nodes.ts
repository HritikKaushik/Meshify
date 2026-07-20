import type { RocketRideComponent } from './rocketride-pipeline.js';
import type { EmbeddingProviderConfig, LlmProviderConfig, QdrantTargetConfig } from './types.js';

export function sourceNode(id: string, type: 'webhook' | 'chat'): RocketRideComponent {
	return { id, provider: type, config: { hideForm: true, mode: 'Source', parameters: {}, type } };
}

export function parseNode(id: string, from: string): RocketRideComponent {
	return { id, provider: 'parse', config: {}, input: [{ lane: 'tags', from }] };
}

export function preprocessorNode(id: string, from: string, chunkSize: number): RocketRideComponent {
	return {
		id,
		provider: 'preprocessor_langchain',
		config: {
			profile: 'default',
			default: { mode: 'strlen', strlen: chunkSize, splitter: 'RecursiveCharacterTextSplitter' },
			parameters: {},
		},
		input: [{ lane: 'text', from }],
	};
}

/** Embeds `documents` (ingest path) or `questions` (query path) — the same profile must be used for both. */
export function embeddingNode(id: string, from: string, lane: 'documents' | 'questions', embedding: EmbeddingProviderConfig): RocketRideComponent {
	const provider = embedding.provider === 'openai' ? 'embedding_openai' : 'embedding_transformer';
	const config: Record<string, unknown> =
		embedding.provider === 'openai'
			? {
					profile: embedding.profile,
					[embedding.profile]: { apikey: `\${${embedding.apiKeyEnvVar}}` },
					parameters: {},
				}
			: { profile: embedding.profile, parameters: {} };

	return { id, provider, config, input: [{ lane, from }] };
}

/**
 * "local" profile assumes Qdrant is reachable by plain host:port with no auth
 * — true only when RocketRide's engine is co-located with Qdrant on the same
 * network. "cloud" profile (host+port+apikey, RocketRide requires a
 * `serverName` tool-namespace too) is used whenever an apiKey is supplied —
 * required for a managed/cloud RocketRide reaching any Qdrant outside its own
 * network, e.g. Qdrant Cloud. See QdrantTargetConfig.apiKey.
 *
 * `score` is required by RocketRide's own component schema even for a store
 * node, where it has no effect on writes — the schema's documented values are
 * a fixed enum [0, 0.4, 0.6, 0.7, 0.8, 0.9, 1]; 0.4 is the placeholder here.
 * (Query-time retrieval no longer goes through this component — see
 * chat-pipeline.ts / ChatContextRetriever in platform-api.)
 */
function qdrantNodeConfig(id: string, qdrant: QdrantTargetConfig): Record<string, unknown> {
	const score = qdrant.scoreThreshold ?? 0.4;
	if (qdrant.apiKey) {
		return {
			profile: 'cloud',
			cloud: { host: qdrant.host, port: qdrant.port, collection: qdrant.collection, score, apikey: qdrant.apiKey, serverName: id },
			parameters: {},
		};
	}
	return {
		profile: 'local',
		local: { host: qdrant.host, port: qdrant.port, collection: qdrant.collection, score },
		parameters: {},
	};
}

export function qdrantStoreNode(id: string, from: string, qdrant: QdrantTargetConfig): RocketRideComponent {
	return { id, provider: 'qdrant', config: qdrantNodeConfig(id, qdrant), input: [{ lane: 'documents', from }] };
}

export function llmNode(id: string, from: string, llm: LlmProviderConfig): RocketRideComponent {
	// Resolved BYOA path: emit a `custom` profile with LITERAL values (no `${ENV}`
	// substitution) so a per-org vault key is injected directly. The component id
	// carries the vendor; the graph shape (questions → answers) is identical to
	// the managed path, so existing pipelines keep working after a provider switch.
	if (llm.mode === 'resolved') {
		const custom: Record<string, unknown> = { model: llm.model, modelTotalTokens: llm.modelTotalTokens, ...(llm.extra ?? {}) };
		if (llm.apiKey !== undefined) custom.apikey = llm.apiKey;
		if (llm.baseUrl !== undefined) {
			// llm_ollama names the endpoint `serverbase`; OpenAI-compatible uses `base_url`.
			if (llm.component === 'llm_ollama') custom.serverbase = llm.baseUrl;
			else custom.base_url = llm.baseUrl;
		}
		return { id, provider: llm.component, config: { profile: 'custom', custom, parameters: {} }, input: [{ lane: 'questions', from }] };
	}

	// Legacy managed path — unchanged output: named profile + `${ROCKETRIDE_*}`.
	const provider = llm.provider === 'openai' ? 'llm_openai' : 'llm_gemini';
	return {
		id,
		provider,
		config: { profile: llm.profile, [llm.profile]: { apikey: `\${${llm.apiKeyEnvVar}}` }, parameters: {} },
		input: [{ lane: 'questions', from }],
	};
}

export function responseAnswersNode(id: string, from: string): RocketRideComponent {
	return { id, provider: 'response_answers', config: { laneName: 'answers' }, input: [{ lane: 'answers', from }] };
}
