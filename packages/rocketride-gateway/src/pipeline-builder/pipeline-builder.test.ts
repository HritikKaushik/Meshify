import { describe, expect, it } from 'vitest';
import { buildIngestPipeline } from './ingest-pipeline.js';
import { buildChatPipeline } from './chat-pipeline.js';
import type { ChatPipelineConfig, IngestPipelineConfig } from './types.js';

const GUID = '00000000-0000-4000-8000-000000000001';

const ingestConfig: IngestPipelineConfig = {
	pipelineGuid: GUID,
	target: 'documents',
	qdrant: { host: 'localhost', port: 6333, collection: 'proj_x_documents' },
	embedding: { provider: 'openai', profile: 'text-embedding-3-large', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
	chunkSize: 768,
};

const chatConfig: ChatPipelineConfig = {
	pipelineGuid: GUID,
	llm: { provider: 'openai', profile: 'openai-5', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
	embedding: { provider: 'openai', profile: 'text-embedding-3-large', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
	docsCollection: { host: 'localhost', port: 6333, collection: 'proj_x_documents' },
	codeCollection: { host: 'localhost', port: 6333, collection: 'proj_x_code' },
	systemInstructions: [],
};

function componentById(pipeline: { components: Array<{ id: string; [k: string]: unknown }> }, id: string) {
	const component = pipeline.components.find((c) => c.id === id);
	expect(component, `component "${id}" missing`).toBeDefined();
	return component as never as { id: string; provider: string; config: Record<string, never>; input?: Array<{ lane: string; from: string }> };
}

describe('buildIngestPipeline', () => {
	const pipeline = buildIngestPipeline(ingestConfig);

	it('produces the webhook -> parse -> preprocessor -> embedding -> qdrant DAG in order', () => {
		expect(pipeline.components.map((c) => c.id)).toEqual(['webhook_1', 'parse_1', 'preprocessor_langchain_1', 'embedding_1', 'qdrant_1']);
		expect(componentById(pipeline, 'parse_1').input).toEqual([{ lane: 'tags', from: 'webhook_1' }]);
		expect(componentById(pipeline, 'preprocessor_langchain_1').input).toEqual([{ lane: 'text', from: 'parse_1' }]);
		expect(componentById(pipeline, 'embedding_1').input).toEqual([{ lane: 'documents', from: 'preprocessor_langchain_1' }]);
		expect(componentById(pipeline, 'qdrant_1').input).toEqual([{ lane: 'documents', from: 'embedding_1' }]);
	});

	it('contains no LLM node — ingest never invokes a model', () => {
		expect(pipeline.components.some((c) => c.provider.startsWith('llm'))).toBe(false);
	});

	it('meets RocketRide pipeline file requirements (literal GUID, version 1, source set)', () => {
		expect(pipeline.project_id).toBe(GUID);
		expect(pipeline.version).toBe(1);
		expect(pipeline.source).toBe('webhook_1');
		expect(pipeline.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
	});

	it('threads chunk size into the preprocessor profile and collection into qdrant', () => {
		const preprocessor = componentById(pipeline, 'preprocessor_langchain_1');
		expect(preprocessor.config).toMatchObject({ profile: 'default', default: { mode: 'strlen', strlen: 768, splitter: 'RecursiveCharacterTextSplitter' } });
		const qdrant = componentById(pipeline, 'qdrant_1');
		expect(qdrant.config).toMatchObject({ profile: 'local', local: { collection: 'proj_x_documents', host: 'localhost', port: 6333 } });
	});

	it('nests the embedding API key template under the profile key (RocketRide profile pattern)', () => {
		const embedding = componentById(pipeline, 'embedding_1');
		expect(embedding.provider).toBe('embedding_openai');
		expect(embedding.config).toMatchObject({
			profile: 'text-embedding-3-large',
			'text-embedding-3-large': { apikey: '${ROCKETRIDE_OPENAI_KEY}' },
		});
	});
});

describe('buildChatPipeline', () => {
	const pipeline = buildChatPipeline(chatConfig);

	it('fans one embedded question into both collection searches (same embedding node)', () => {
		expect(componentById(pipeline, 'embedding_1').input).toEqual([{ lane: 'questions', from: 'chat_1' }]);
		expect(componentById(pipeline, 'qdrant_docs_1').input).toEqual([{ lane: 'questions', from: 'embedding_1' }]);
		expect(componentById(pipeline, 'qdrant_code_1').input).toEqual([{ lane: 'questions', from: 'embedding_1' }]);
	});

	it('merges retrieved documents from both collections in the prompt node', () => {
		const prompt = componentById(pipeline, 'prompt_1');
		expect(prompt.input).toContainEqual({ lane: 'documents', from: 'qdrant_docs_1' });
		expect(prompt.input).toContainEqual({ lane: 'documents', from: 'qdrant_code_1' });
		expect(prompt.input).toContainEqual({ lane: 'questions', from: 'qdrant_docs_1' });
	});

	it('routes prompt -> llm -> response_answers, and both retrievals -> response_documents', () => {
		expect(componentById(pipeline, 'llm_1').input).toEqual([{ lane: 'questions', from: 'prompt_1' }]);
		expect(componentById(pipeline, 'response_answers_1').input).toEqual([{ lane: 'answers', from: 'llm_1' }]);
		expect(componentById(pipeline, 'response_documents_1').input).toEqual([
			{ lane: 'documents', from: 'qdrant_docs_1' },
			{ lane: 'documents', from: 'qdrant_code_1' },
		]);
	});

	it('applies grounding/anti-injection default instructions when none are provided', () => {
		const prompt = componentById(pipeline, 'prompt_1');
		const instructions = (prompt.config as { instructions: string[] }).instructions;
		expect(instructions.length).toBeGreaterThan(0);
		expect(instructions.join(' ')).toMatch(/ONLY the information contained in the retrieved context/);
		expect(instructions.join(' ')).toMatch(/untrusted content/);
	});

	it('configures the LLM using the profile-nested key pattern', () => {
		const llm = componentById(pipeline, 'llm_1');
		expect(llm.provider).toBe('llm_openai');
		expect(llm.config).toMatchObject({ profile: 'openai-5', 'openai-5': { apikey: '${ROCKETRIDE_OPENAI_KEY}' } });
	});
});
