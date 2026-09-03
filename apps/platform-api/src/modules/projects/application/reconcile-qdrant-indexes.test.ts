import { describe, expect, it, vi } from 'vitest';
import { InMemoryProjectRepository, buildProject } from '@meshify/testing';
import { reconcileQdrantPayloadIndexes } from './reconcile-qdrant-indexes.js';

const logger = { info: vi.fn(), warn: vi.fn() };

describe('reconcileQdrantPayloadIndexes', () => {
	it('ensures indexes on every live collection and keeps going past a failing one', async () => {
		const projects = new InMemoryProjectRepository({
			projects: [
				buildProject({ id: 'p1', qdrantCollectionDocs: 'p1_docs', qdrantCollectionCode: 'p1_code' }),
				buildProject({ id: 'p2', qdrantCollectionDocs: 'p2_docs', qdrantCollectionCode: null }),
			],
		});
		const seen: string[] = [];
		const qdrant = {
			ensurePayloadIndexes: async (collection: string) => {
				seen.push(collection);
				if (collection === 'p1_code') throw new Error('qdrant 502');
				return collection === 'p1_docs' ? ['meta.parent'] : [];
			},
		};

		const result = await reconcileQdrantPayloadIndexes(projects, qdrant, logger);

		expect(seen).toEqual(['p1_docs', 'p1_code', 'p2_docs']);
		expect(result).toEqual({ created: 1, failed: 1 });
		expect(logger.warn).toHaveBeenCalledOnce();
	});
});
