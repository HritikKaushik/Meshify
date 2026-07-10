import { describe, expect, it } from 'vitest';
import { buildQdrantFilter } from './qdrant-search.client.js';

describe('buildQdrantFilter', () => {
	it('returns undefined when no filters are set (unfiltered search)', () => {
		expect(buildQdrantFilter({})).toBeUndefined();
	});

	it('maps language and parent_type to exact-match conditions', () => {
		expect(buildQdrantFilter({ language: 'typescript', parentType: 'file' })).toEqual({
			must: [
				{ key: 'language', match: { value: 'typescript' } },
				{ key: 'parent_type', match: { value: 'file' } },
			],
		});
	});

	it('maps a source path prefix to a text match on source_path', () => {
		expect(buildQdrantFilter({ sourcePathPrefix: 'src/' })).toEqual({
			must: [{ key: 'source_path', match: { text: 'src/' } }],
		});
	});
});
