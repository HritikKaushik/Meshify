import { describe, expect, it } from 'vitest';
import type { Project } from '@meshify/data-access';
import type { EmbeddingProvider } from '@meshify/embeddings';
import type { QdrantSearchClient, QdrantSearchHit } from '@meshify/vector-store';
import { SearchUseCase, type EmbeddingProviderFactory } from './search.usecase.js';

const PROJECT = {
	id: 'p1',
	embeddingProfile: 'text-embedding-3-large',
	qdrantCollectionDocs: 'proj_x_documents',
	qdrantCollectionCode: 'proj_x_code',
} as unknown as Project;

const fakeEmbeddings: EmbeddingProviderFactory = {
	forProject: () => ({ profile: 'text-embedding-3-large', embed: async () => [0.1, 0.2, 0.3] }) as EmbeddingProvider,
};

function fakeQdrant(byCollection: Record<string, QdrantSearchHit[]>) {
	const calls: Array<{ collection: string; limit: number; filters?: unknown }> = [];
	const client = {
		async search(collection: string, _vector: number[], options: { limit: number; filters?: unknown }) {
			calls.push({ collection, limit: options.limit, filters: options.filters });
			return byCollection[collection] ?? [];
		},
	} as unknown as QdrantSearchClient;
	return { client, calls };
}

// RocketRide payload shape: `content` + `meta` (parent = source path, chunkId).
function hit(id: string, score: number, sourcePath: string, meta: Record<string, unknown> = {}): QdrantSearchHit {
	return { id, score, payload: { content: `content of ${sourcePath}`, meta: { parent: sourcePath, ...meta } } };
}

describe('SearchUseCase', () => {
	it('merges documents and code hits into one score-descending ranking, tagged by collection', async () => {
		const { client } = fakeQdrant({
			proj_x_documents: [hit('d1', 0.7, 'docs/a.md')],
			proj_x_code: [hit('c1', 0.9, 'src/a.ts', { chunkId: 3 })],
		});
		const usecase = new SearchUseCase(fakeEmbeddings, client);

		const result = await usecase.execute({ project: PROJECT, query: 'how does X work', mode: 'semantic' });

		expect(result.results.map((r) => [r.id, r.collection])).toEqual([
			['c1', 'code'],
			['d1', 'documents'],
		]);
		expect(result.results[0]).toMatchObject({ sourcePath: 'src/a.ts', chunkIndex: 3, content: 'content of src/a.ts' });
		expect(result.degradedTo).toBeUndefined();
	});

	it('filters out the RocketRide schema control document (meta.isDeleted)', async () => {
		const schemaDoc: QdrantSearchHit = { id: 'schema', score: 0.1, payload: { content: '', meta: { objectId: 'schema', isDeleted: true } } };
		const { client } = fakeQdrant({ proj_x_documents: [hit('d1', 0.7, 'docs/a.md'), schemaDoc], proj_x_code: [] });
		const usecase = new SearchUseCase(fakeEmbeddings, client);

		const result = await usecase.execute({ project: PROJECT, query: 'x', mode: 'semantic' });

		expect(result.results.map((r) => r.id)).toEqual(['d1']); // schema doc excluded
	});

	it('degrades keyword/hybrid to semantic with a warning (sparse not populated at ingest)', async () => {
		const { client } = fakeQdrant({});
		const usecase = new SearchUseCase(fakeEmbeddings, client);

		const result = await usecase.execute({ project: PROJECT, query: 'x', mode: 'hybrid' });

		expect(result.mode).toBe('hybrid'); // echoes what was asked
		expect(result.degradedTo).toBe('semantic');
		expect(result.warning).toMatch(/not yet available/);
	});

	it('honors scope=code by only querying the code collection', async () => {
		const { client, calls } = fakeQdrant({ proj_x_code: [hit('c1', 0.5, 'src/a.ts')] });
		const usecase = new SearchUseCase(fakeEmbeddings, client);

		const result = await usecase.execute({ project: PROJECT, query: 'x', mode: 'semantic', scope: 'code' });

		expect(calls.map((c) => c.collection)).toEqual(['proj_x_code']);
		expect(result.results).toHaveLength(1);
	});

	it('respects the limit after merging, and over-fetches per collection for better ranking', async () => {
		const { client, calls } = fakeQdrant({
			proj_x_documents: Array.from({ length: 5 }, (_, i) => hit(`d${i}`, 0.5 - i * 0.01, `docs/${i}.md`)),
			proj_x_code: Array.from({ length: 5 }, (_, i) => hit(`c${i}`, 0.9 - i * 0.01, `src/${i}.ts`)),
		});
		const usecase = new SearchUseCase(fakeEmbeddings, client);

		const result = await usecase.execute({ project: PROJECT, query: 'x', mode: 'semantic', limit: 3 });

		expect(result.results).toHaveLength(3);
		// top 3 are all code (higher scores), highest first
		expect(result.results.map((r) => r.id)).toEqual(['c0', 'c1', 'c2']);
		// per-collection over-fetch = limit * 2
		expect(calls.every((c) => c.limit === 6)).toBe(true);
	});

	it('passes metadata filters through to Qdrant', async () => {
		const { client, calls } = fakeQdrant({});
		const usecase = new SearchUseCase(fakeEmbeddings, client);

		await usecase.execute({ project: PROJECT, query: 'x', mode: 'semantic', filters: { language: 'python' } });

		expect(calls.every((c) => (c.filters as { language?: string }).language === 'python')).toBe(true);
	});
});
