import { describe, expect, it } from 'vitest';
import { matches, recallAtK, reciprocalRank, summarize } from '../../scripts/rag-eval-metrics.mjs';

describe('rag-eval metrics', () => {
	it('matches an expected path by exact value or path suffix', () => {
		expect(matches('docs/refund-policy.md', 'refund-policy.md')).toBe(true);
		expect(matches('docs/refund-policy.md', 'docs/refund-policy.md')).toBe(true);
		expect(matches('docs/refund-policy.md', 'policy.md')).toBe(true);
		expect(matches('docs/refund-policy.md', 'other.md')).toBe(false);
	});

	it('computes recall@k over the top k and the reciprocal rank of the first hit', () => {
		const retrieved = ['a.md', 'b.md', 'c.md', 'd.md'];
		expect(recallAtK(['b.md', 'zzz.md'], retrieved, 4)).toBe(0.5);
		expect(recallAtK(['d.md'], retrieved, 3)).toBe(0);
		expect(recallAtK([], retrieved, 3)).toBe(1);
		expect(reciprocalRank(['c.md'], retrieved)).toBeCloseTo(1 / 3);
		expect(reciprocalRank(['nope'], retrieved)).toBe(0);
	});

	it('summarizes per-case results and lists the misses', () => {
		const summary = summarize(
			[
				{ question: 'q1', recall: 1, reciprocalRank: 1, confidence: 0.9 },
				{ question: 'q2', recall: 0.5, reciprocalRank: 0.5, confidence: 0.3 },
			],
			8
		);
		expect(summary).toEqual({ cases: 2, k: 8, recallAtK: 0.75, mrr: 0.75, meanConfidence: 0.6, missed: ['q2'] });
	});
});
