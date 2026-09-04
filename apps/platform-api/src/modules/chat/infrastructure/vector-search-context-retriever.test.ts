import { describe, expect, it } from 'vitest';
import type { Project } from '@meshify/data-access';
import type { QdrantSearchClient, QdrantSearchHit } from '@meshify/vector-store';
import type { EmbeddingProviderFactory } from '../../retrieval/application/embedding-provider.port.js';
import { VectorSearchContextRetriever } from './vector-search-context-retriever.js';

const PROJECT = { id: 'p1', qdrantCollectionDocs: 'docs', qdrantCollectionCode: 'code', embeddingProfile: 'openai-text-embedding-3-large' } as unknown as Project;

/** Embeds a query as a one-hot-ish vector keyed by its text, so the fake store can answer per query. */
const embeddings: EmbeddingProviderFactory = { forProject: () => ({ embed: async (text: string) => [text.length], dimension: 1, modelName: 'fake' }) as never };

const hit = (id: string, score: number, content: string, parent = `${id}.md`): QdrantSearchHit => ({ id, score, payload: { content, meta: { parent, chunkId: 0 } } });

function fakeQdrant(answers: Record<string, QdrantSearchHit[]>) {
	const calls: Array<{ collection: string; options: { limit: number; scoreThreshold?: number } }> = [];
	const qdrant = {
		search: async (collection: string, vector: number[], options: { limit: number; scoreThreshold?: number }) => {
			calls.push({ collection, options });
			return answers[`${collection}:${vector[0]}`] ?? [];
		},
	} as unknown as QdrantSearchClient;
	return { qdrant, calls };
}

describe('VectorSearchContextRetriever', () => {
	it('passes the similarity floor to Qdrant and drops anything below it', async () => {
		const q = 'refund policy';
		const { qdrant, calls } = fakeQdrant({ [`docs:${q.length}`]: [hit('a', 0.7, 'refund policy text'), hit('b', 0.2, 'unrelated')] });
		const retriever = new VectorSearchContextRetriever(embeddings, qdrant, { minScore: 0.25 });
		const chunks = await retriever.retrieve(PROJECT, q);
		expect(calls.every((c) => c.options.scoreThreshold === 0.25)).toBe(true);
		expect(chunks.map((c) => c.chunkId)).toEqual(['a']);
	});

	it('retrieves a follow-up with the previous turn too and unions the candidates, best score kept', async () => {
		const question = 'Why does it fail?';
		const expanded = `How does the refund job run?\n${question}`;
		const { qdrant, calls } = fakeQdrant({
			[`docs:${question.length}`]: [hit('shared', 0.4, 'refund job failure modes')],
			[`docs:${expanded.length}`]: [hit('shared', 0.55, 'refund job failure modes'), hit('only-expanded', 0.5, 'refund job schedule')],
		});
		const retriever = new VectorSearchContextRetriever(embeddings, qdrant, { minScore: 0.25 });
		const chunks = await retriever.retrieve(PROJECT, question, { history: [{ role: 'user', content: 'How does the refund job run?' }] });
		expect(calls.filter((c) => c.collection === 'docs')).toHaveLength(2);
		expect(chunks.map((c) => [c.chunkId, c.score])).toEqual([
			['shared', 0.55],
			['only-expanded', 0.5],
		]);
	});

	it('ranks an exact identifier match first even when a topical chunk scores higher, and caps at eight', async () => {
		const q = 'ERR_REFUND_WINDOW_CLOSED';
		const hits = [hit('topical', 0.66, 'Refund windows close after thirty days.'), hit('exact', 0.6, 'ERR_REFUND_WINDOW_CLOSED is thrown when the window closed.')];
		for (let i = 0; i < 12; i++) hits.push(hit(`filler-${i}`, 0.5 - i * 0.01, `note ${i}`));
		const { qdrant } = fakeQdrant({ [`docs:${q.length}`]: hits });
		const retriever = new VectorSearchContextRetriever(embeddings, qdrant, { minScore: 0.25 });
		const chunks = await retriever.retrieve(PROJECT, q);
		expect(chunks[0]?.chunkId).toBe('exact');
		expect(chunks[1]?.chunkId).toBe('topical');
		expect(chunks).toHaveLength(8);
	});
});
