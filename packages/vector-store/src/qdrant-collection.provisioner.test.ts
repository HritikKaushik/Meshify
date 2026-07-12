import { afterEach, describe, expect, it, vi } from 'vitest';
import { QdrantCollectionProvisioner } from './qdrant-collection.provisioner.js';

interface Call {
	url: string;
	method: string;
	body: unknown;
}

function mockFetch() {
	const calls: Call[] = [];
	const fn = vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
		calls.push({ url: url.toString(), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
		return { ok: true, status: 200, text: async () => '' } as Response;
	});
	vi.stubGlobal('fetch', fn);
	return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('QdrantCollectionProvisioner.ensureCollection', () => {
	it('creates a dense-only Cosine collection then writes the RocketRide schema control document', async () => {
		const calls = mockFetch();
		await new QdrantCollectionProvisioner('http://qdrant:6333').ensureCollection('proj_x_documents', 3072, 'text-embedding-3-large');

		expect(calls).toHaveLength(2);

		const [create, schema] = calls;
		// 1) collection create — dense Cosine, no sparse_vectors slot.
		expect(create!.method).toBe('PUT');
		expect(create!.url).toContain('/collections/proj_x_documents');
		expect(create!.body).toEqual({ vectors: { size: 3072, distance: 'Cosine' } });

		// 2) schema/control point RocketRide checks for before it will ingest.
		expect(schema!.url).toContain('/collections/proj_x_documents/points');
		const point = (schema!.body as { points: Array<{ vector: number[]; payload: { meta: Record<string, unknown> } }> }).points[0]!;
		expect(point.vector).toHaveLength(3072);
		expect(point.vector.every((v) => v === 0)).toBe(true);
		expect(point.payload.meta).toMatchObject({ objectId: 'schema', isDeleted: true, vectorSize: 3072, modelName: 'text-embedding-3-large' });
	});

	it('throws if the collection create fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response));
		await expect(new QdrantCollectionProvisioner('http://qdrant:6333').ensureCollection('c', 3072, 'm')).rejects.toThrow(/Failed to create Qdrant collection/);
	});
});
