import { describe, expect, it } from 'vitest';
import { hybridRank, lexicalScores, tokenize } from './hybrid-rank.js';
import type { RetrievalResultItem } from './retrieval-result.js';

const item = (id: string, score: number, content: string): RetrievalResultItem => ({ id, collection: 'documents', source: 'documents', sourcePath: `${id}.md`, score, content, chunkIndex: 0 });

describe('tokenize', () => {
	it('lowercases, keeps identifiers verbatim, singularizes plain words, drops stopwords and single characters', () => {
		expect(tokenize('How does refund_policy handle Chargebacks in EU?')).toEqual(['refund_policy', 'handle', 'chargeback', 'eu']);
		expect(tokenize('policies boxes ERR_CODES v2')).toEqual(['policy', 'box', 'err_codes', 'v2']);
	});
});

describe('lexicalScores', () => {
	it('scores chunks that contain the query terms, rarer terms counting more', () => {
		const items = [item('a', 0.5, 'refund policy for chargebacks'), item('b', 0.5, 'refund policy overview'), item('c', 0.5, 'holiday calendar')];
		const scores = lexicalScores('chargeback refund', items);
		expect(scores[0]).toBeGreaterThan(scores[1]!);
		expect(scores[1]).toBeGreaterThan(0);
		expect(scores[2]).toBe(0);
	});

	it('returns zeros for an empty query or empty contents', () => {
		expect(lexicalScores('the', [item('a', 0.5, 'anything')])).toEqual([0]);
		expect(lexicalScores('refund', [item('a', 0.5, '')])).toEqual([0]);
	});
});

describe('hybridRank', () => {
	it('pulls an exact-term match above a semantically closer chunk without it, keeping cosine scores intact', () => {
		const semantic = item('semantic', 0.62, 'Customers may return goods within thirty days for their money back.');
		const exact = item('exact', 0.58, 'ERR_REFUND_WINDOW_CLOSED is raised when the refund window has closed.');
		const noise = item('noise', 0.55, 'Quarterly planning notes.');
		const ranked = hybridRank('ERR_REFUND_WINDOW_CLOSED', [semantic, exact, noise]);
		expect(ranked.map((r) => r.id)).toEqual(['exact', 'semantic', 'noise']);
		expect(ranked[0]?.score).toBe(0.58);
	});

	it('falls back to the dense order when nothing matches lexically', () => {
		const ranked = hybridRank('zzz', [item('lo', 0.3, 'alpha'), item('hi', 0.9, 'beta')]);
		expect(ranked.map((r) => r.id)).toEqual(['hi', 'lo']);
	});
});
