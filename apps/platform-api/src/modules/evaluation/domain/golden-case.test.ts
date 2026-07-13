import { describe, expect, it } from 'vitest';
import { evaluateAnswer, type EvaluatedAnswer, type GoldenCase } from './golden-case.js';

function answer(overrides: Partial<EvaluatedAnswer> = {}): EvaluatedAnswer {
	return {
		answer: 'The auth flow uses a GitHub App and RS256 JWTs.',
		citations: [{ sourcePath: 'src/github/auth.ts' }],
		confidence: 0.8,
		...overrides,
	};
}

describe('evaluateAnswer', () => {
	it('passes when all required keywords are present (case-insensitive)', () => {
		const c: GoldenCase = { id: 'k', question: 'q', expectedKeywords: ['github app', 'RS256'] };
		const { passed, checks } = evaluateAnswer(c, answer());
		expect(passed).toBe(true);
		expect(checks).toHaveLength(1);
		expect(checks[0]).toMatchObject({ check: 'keywords_all', passed: true });
	});

	it('fails and reports the missing keyword', () => {
		const c: GoldenCase = { id: 'k', question: 'q', expectedKeywords: ['github app', 'oauth'] };
		const { passed, checks } = evaluateAnswer(c, answer());
		expect(passed).toBe(false);
		expect(checks[0]?.detail).toContain('oauth');
	});

	it('anyKeywords passes if at least one is present', () => {
		const c: GoldenCase = { id: 'k', question: 'q', anyKeywords: ['saml', 'jwt'] };
		expect(evaluateAnswer(c, answer()).passed).toBe(true);
	});

	it('forbiddenKeywords fails if a forbidden term appears', () => {
		const c: GoldenCase = { id: 'k', question: 'q', forbiddenKeywords: ['password'] };
		expect(evaluateAnswer(c, answer({ answer: 'Store the password in plaintext.' })).passed).toBe(false);
	});

	it('sources check matches citations by substring', () => {
		const c: GoldenCase = { id: 'k', question: 'q', expectedSources: ['github/auth.ts'] };
		expect(evaluateAnswer(c, answer()).passed).toBe(true);
	});

	it('sources check fails when the expected source is not cited', () => {
		const c: GoldenCase = { id: 'k', question: 'q', expectedSources: ['src/billing.ts'] };
		const { passed, checks } = evaluateAnswer(c, answer());
		expect(passed).toBe(false);
		expect(checks[0]?.detail).toContain('src/billing.ts');
	});

	it('minConfidence gates on the answer confidence', () => {
		const c: GoldenCase = { id: 'k', question: 'q', minConfidence: 0.9 };
		expect(evaluateAnswer(c, answer({ confidence: 0.8 })).passed).toBe(false);
		expect(evaluateAnswer(c, answer({ confidence: 0.95 })).passed).toBe(true);
	});

	it('a case passes only when every specified check passes', () => {
		const c: GoldenCase = { id: 'k', question: 'q', expectedKeywords: ['github app'], minConfidence: 0.9 };
		const { passed, checks } = evaluateAnswer(c, answer({ confidence: 0.5 }));
		expect(passed).toBe(false);
		expect(checks.map((ch) => ch.passed)).toEqual([true, false]);
	});
});
