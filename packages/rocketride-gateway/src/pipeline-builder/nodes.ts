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
 */
function qdrantNodeConfig(id: string, qdrant: QdrantTargetConfig): Record<string, unknown> {
	const score = qdrant.scoreThreshold ?? 0.7;
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

export function qdrantSearchNode(id: string, from: string, qdrant: QdrantTargetConfig): RocketRideComponent {
	return { id, provider: 'qdrant', config: qdrantNodeConfig(id, qdrant), input: [{ lane: 'questions', from }] };
}

export function promptNode(id: string, documentSources: string[], questionsSource: string, instructions: string[]): RocketRideComponent {
	return {
		id,
		provider: 'prompt',
		config: { instructions, parameters: {} },
		input: [...documentSources.map((from) => ({ lane: 'documents', from })), { lane: 'questions', from: questionsSource }],
	};
}

export function llmNode(id: string, from: string, llm: LlmProviderConfig): RocketRideComponent {
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

export function responseDocumentsNode(id: string, sources: string[]): RocketRideComponent {
	return {
		id,
		provider: 'response_documents',
		config: { laneName: 'documents' },
		input: sources.map((from) => ({ lane: 'documents', from })),
	};
}
