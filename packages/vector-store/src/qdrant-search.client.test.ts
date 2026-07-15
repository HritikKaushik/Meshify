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

	it('maps a source path prefix to a text match on payload.meta.parent (the key RocketRide actually writes)', () => {
		expect(buildQdrantFilter({ sourcePathPrefix: 'src/' })).toEqual({
			must: [{ key: 'meta.parent', match: { text: 'src/' } }],
		});
	});

	it('maps an exact source path (used for deletion) to meta.parent', () => {
		expect(buildQdrantFilter({ sourcePathExact: 'refund-runbook.md' })).toEqual({
			must: [{ key: 'meta.parent', match: { value: 'refund-runbook.md' } }],
		});
	});

	it('maps a source path exclusion to a must_not on meta.parent', () => {
		expect(buildQdrantFilter({ sourcePathPrefixNot: 'slack/' })).toEqual({
			must_not: [{ key: 'meta.parent', match: { text: 'slack/' } }],
		});
	});
});
