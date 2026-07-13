/**
 * One golden-set test case: a question plus the expectations its answer must
 * satisfy. All expectation fields are optional but a case must carry at least
 * one (enforced at the DTO layer) — a case with nothing to check isn't a test.
 */
export interface GoldenCase {
	id: string;
	question: string;
	/** Every keyword must appear in the answer (case-insensitive substring). */
	expectedKeywords?: string[];
	/** At least one of these must appear in the answer. */
	anyKeywords?: string[];
	/** None of these may appear in the answer (hallucination / refusal guards). */
	forbiddenKeywords?: string[];
	/** Each must be matched by some citation's source path (retrieval quality). */
	expectedSources?: string[];
	/** The answer's confidence must be at least this. */
	minConfidence?: number;
}

export interface CheckResult {
	check: string;
	passed: boolean;
	detail: string;
}

export interface CaseResult {
	id: string;
	question: string;
	passed: boolean;
	answer: string;
	confidence: number;
	latencyMs: number;
	tokens: number;
	citations: string[];
	checks: CheckResult[];
	/** Set only when the RAG call itself failed; such a case counts as failed. */
	error?: string;
}

/**
 * What the evaluator needs from a completed chat turn — citations/confidence
 * come from the caller's own retrieval (RocketRide's chat pipeline is now a
 * bare LLM call, see chat-pipeline.ts), the rest from the LLM response.
 */
export interface EvaluatedAnswer {
	answer: string;
	citations: Array<{ sourcePath: string }>;
	confidence: number;
}

function includesCI(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Pure scoring of a single answer against a case's expectations. Only the
 * checks the case actually specifies are evaluated; the case passes iff every
 * evaluated check passes. No RocketRide types beyond the answer shape, so this
 * is unit-testable in isolation.
 */
export function evaluateAnswer(goldenCase: GoldenCase, answer: EvaluatedAnswer): { passed: boolean; checks: CheckResult[] } {
	const checks: CheckResult[] = [];
	const text = answer.answer;
	const citationPaths = answer.citations.map((c) => c.sourcePath);

	if (goldenCase.expectedKeywords?.length) {
		const missing = goldenCase.expectedKeywords.filter((k) => !includesCI(text, k));
		checks.push({
			check: 'keywords_all',
			passed: missing.length === 0,
			detail: missing.length === 0 ? 'all required keywords present' : `missing: ${missing.join(', ')}`,
		});
	}

	if (goldenCase.anyKeywords?.length) {
		const found = goldenCase.anyKeywords.some((k) => includesCI(text, k));
		checks.push({
			check: 'keywords_any',
			passed: found,
			detail: found ? 'at least one keyword present' : `none of: ${goldenCase.anyKeywords.join(', ')}`,
		});
	}

	if (goldenCase.forbiddenKeywords?.length) {
		const present = goldenCase.forbiddenKeywords.filter((k) => includesCI(text, k));
		checks.push({
			check: 'forbidden_absent',
			passed: present.length === 0,
			detail: present.length === 0 ? 'no forbidden keywords present' : `present: ${present.join(', ')}`,
		});
	}

	if (goldenCase.expectedSources?.length) {
		const missing = goldenCase.expectedSources.filter((s) => !citationPaths.some((p) => includesCI(p, s)));
		checks.push({
			check: 'sources',
			passed: missing.length === 0,
			detail: missing.length === 0 ? 'all expected sources cited' : `not cited: ${missing.join(', ')}`,
		});
	}

	if (goldenCase.minConfidence !== undefined) {
		const passed = answer.confidence >= goldenCase.minConfidence;
		checks.push({
			check: 'min_confidence',
			passed,
			detail: `confidence ${answer.confidence.toFixed(3)} ${passed ? '>=' : '<'} ${goldenCase.minConfidence}`,
		});
	}

	return { passed: checks.every((c) => c.passed), checks };
}
