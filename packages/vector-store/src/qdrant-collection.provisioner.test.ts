import { afterEach, describe, expect, it, vi } from 'vitest';
import { QdrantCollectionProvisioner } from './qdrant-collection.provisioner.js';

interface Call {
	url: string;
	method: string;
	body: unknown;
}

type Responder = (call: Call) => { status: number; body?: unknown } | undefined;

/**
 * Fake Qdrant: records every call; `respond` overrides the default 200 for
 * specific calls (e.g. 409 on a create, an existing payload_schema on GET).
 */
function mockFetch(respond: Responder = () => undefined) {
	const calls: Call[] = [];
	const fn = vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
		const call: Call = { url: url.toString(), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined };
		calls.push(call);
		const custom = respond(call);
		const status = custom?.status ?? 200;
		const payload = custom?.body ?? { result: {} };
		return { ok: status >= 200 && status < 300, status, text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)), json: async () => payload } as Response;
	});
	vi.stubGlobal('fetch', fn);
	return calls;
}

const indexCalls = (calls: Call[]) => calls.filter((c) => c.method === 'PUT' && c.url.includes('/index'));

afterEach(() => vi.unstubAllGlobals());

describe('QdrantCollectionProvisioner.ensureCollection', () => {
	it('creates a dense-only Cosine collection, writes the RocketRide schema control document, then the payload indexes', async () => {
		const calls = mockFetch();
		await new QdrantCollectionProvisioner('http://qdrant:6333').ensureCollection('proj_x_documents', 3072, 'text-embedding-3-large');

		const [create, schema, info] = calls;
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

		// 3) payload indexes for every field the search client filters/deletes on.
		expect(info!.method).toBe('GET');
		expect(indexCalls(calls).map((c) => c.body)).toEqual([
			{ field_name: 'language', field_schema: 'keyword' },
			{ field_name: 'parent_type', field_schema: 'keyword' },
			{ field_name: 'meta.parent', field_schema: 'keyword' },
		]);
	});

	it('is idempotent: an existing collection (409) is kept and only missing indexes are created', async () => {
		const calls = mockFetch((call) => {
			if (call.method === 'PUT' && call.url.endsWith('/collections/c')) return { status: 409, body: { status: { error: 'Collection `c` already exists!' } } };
			if (call.method === 'GET') return { status: 200, body: { result: { payload_schema: { language: { data_type: 'keyword' }, parent_type: { data_type: 'keyword' } } } } };
			return undefined;
		});
		await new QdrantCollectionProvisioner('http://qdrant:6333').ensureCollection('c', 3072, 'm');
		expect(indexCalls(calls).map((c) => (c.body as { field_name: string }).field_name)).toEqual(['meta.parent']);
	});

	it('throws if the collection create fails for any other reason', async () => {
		mockFetch((call) => (call.method === 'PUT' ? { status: 500, body: 'boom' } : undefined));
		await expect(new QdrantCollectionProvisioner('http://qdrant:6333').ensureCollection('c', 3072, 'm')).rejects.toThrow(/Failed to create Qdrant collection/);
	});
});

describe('QdrantCollectionProvisioner.ensurePayloadIndexes', () => {
	it('reports the fields it created and returns undefined for a collection that does not exist', async () => {
		const calls = mockFetch((call) => (call.method === 'GET' && call.url.endsWith('/collections/missing') ? { status: 404, body: { status: { error: 'not found' } } } : undefined));
		const provisioner = new QdrantCollectionProvisioner('http://qdrant:6333', 'secret');
		expect(await provisioner.ensurePayloadIndexes('present')).toEqual(['language', 'parent_type', 'meta.parent']);
		expect(await provisioner.ensurePayloadIndexes('missing')).toBeUndefined();
		expect(indexCalls(calls).every((c) => c.url.includes('/collections/present/'))).toBe(true);
	});
});
