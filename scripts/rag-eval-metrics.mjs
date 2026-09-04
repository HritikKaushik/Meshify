/**
 * Scoring for the offline RAG evaluation (scripts/rag-eval.mjs). Pure
 * functions over a case's expected source paths and the ranked source paths
 * the API retrieved, so they can be unit-tested without a stack.
 */

/** A retrieved path counts as a hit when it equals an expected path or ends with it (expected paths may be given without their leading folders). */
export function matches(retrievedPath, expectedPath) {
	return retrievedPath === expectedPath || retrievedPath.endsWith(`/${expectedPath}`) || retrievedPath.endsWith(expectedPath);
}

/** Share of expected sources found within the top k retrieved paths (0..1). */
export function recallAtK(expected, retrieved, k) {
	if (expected.length === 0) return 1;
	const top = retrieved.slice(0, k);
	const found = expected.filter((e) => top.some((r) => matches(r, e))).length;
	return found / expected.length;
}

/** 1 / rank of the first retrieved path that is expected, or 0. */
export function reciprocalRank(expected, retrieved) {
	const index = retrieved.findIndex((r) => expected.some((e) => matches(r, e)));
	return index === -1 ? 0 : 1 / (index + 1);
}

/** Aggregates per-case results into the numbers the report prints. */
export function summarize(results, k) {
	const n = results.length || 1;
	const mean = (values) => values.reduce((a, b) => a + b, 0) / n;
	return {
		cases: results.length,
		k,
		recallAtK: round(mean(results.map((r) => r.recall))),
		mrr: round(mean(results.map((r) => r.reciprocalRank))),
		meanConfidence: round(mean(results.map((r) => r.confidence ?? 0))),
		missed: results.filter((r) => r.recall < 1).map((r) => r.question),
	};
}

function round(value) {
	return Math.round(value * 1000) / 1000;
}
