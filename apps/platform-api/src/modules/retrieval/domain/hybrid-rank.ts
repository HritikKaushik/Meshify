import type { RetrievalResultItem } from './retrieval-result.js';

/**
 * Lexical re-ranking over the dense candidates. Cosine similarity alone ranks
 * a chunk that merely talks about the same topic above one that contains the
 * exact identifier, error string or product name the user typed. Scoring each
 * candidate with a BM25-style term match against the query and fusing the two
 * orderings with reciprocal rank fusion keeps the semantic recall of the vector
 * search while pulling exact matches up. Scores stay the cosine values (they
 * feed citations and confidence); only the ORDER is hybrid.
 */

const STOPWORDS = new Set([
	'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'it', 'its', 'this', 'that', 'these', 'those',
	'i', 'we', 'you', 'they', 'he', 'she', 'my', 'our', 'your', 'their', 'me', 'us', 'them', 'do', 'does', 'did', 'how', 'what', 'which', 'who', 'when',
	'where', 'why', 'can', 'could', 'would', 'should', 'will', 'from', 'by', 'at', 'as', 'about', 'into', 'than', 'then', 'so', 'if', 'not', 'no', 'yes',
	'please', 'tell', 'show', 'explain', 'describe', 'find', 'get', 'have', 'has', 'had', 'there', 'here', 'any', 'some', 'all',
]);

/**
 * Lowercased alphanumeric terms (identifiers keep their underscores), minus
 * stopwords and one-character tokens. Plain words lose a plural suffix so
 * "chargebacks" matches "chargeback"; identifiers and tokens with digits are
 * left exactly as written, since ERR_CODES and versions must match verbatim.
 */
export function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9_]+/)
		.filter((t) => t.length > 1 && !STOPWORDS.has(t))
		.map(singular);
}

function singular(token: string): string {
	if (token.length <= 3 || /[_0-9]/.test(token)) return token;
	if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
	if (token.endsWith('sses') || token.endsWith('shes') || token.endsWith('ches') || token.endsWith('xes')) return token.slice(0, -2);
	if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
	return token;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const RRF_K = 60;

/**
 * BM25 score of each candidate against the query, computed over the candidate
 * set itself (document frequencies and average length come from the
 * candidates, which is the corpus the re-ranking decides between).
 */
export function lexicalScores(query: string, items: readonly RetrievalResultItem[]): number[] {
	const queryTerms = [...new Set(tokenize(query))];
	if (queryTerms.length === 0 || items.length === 0) return items.map(() => 0);
	const docs = items.map((item) => tokenize(item.content ?? ''));
	const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;
	const df = new Map<string, number>();
	for (const doc of docs) for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
	const n = docs.length;
	return docs.map((doc) => {
		if (doc.length === 0) return 0;
		const tf = new Map<string, number>();
		for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1);
		let score = 0;
		for (const term of queryTerms) {
			const f = tf.get(term) ?? 0;
			if (f === 0) continue;
			const idf = Math.log(1 + (n - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
			score += idf * ((f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * (doc.length / avgLength))));
		}
		return score;
	});
}

/**
 * Orders candidates by reciprocal rank fusion of the dense ranking (cosine,
 * descending) and the lexical ranking (BM25, descending). Candidates with no
 * lexical match keep only their dense contribution, so a purely semantic hit
 * still ranks, just below an equally close chunk that also matches the words.
 */
export function hybridRank(query: string, items: readonly RetrievalResultItem[]): RetrievalResultItem[] {
	if (items.length <= 1) return [...items];
	const lexical = lexicalScores(query, items);
	const denseOrder = items.map((_, i) => i).sort((a, b) => items[b]!.score - items[a]!.score);
	const lexicalOrder = items.map((_, i) => i).filter((i) => lexical[i]! > 0).sort((a, b) => lexical[b]! - lexical[a]!);
	const fused = new Map<number, number>();
	denseOrder.forEach((index, rank) => fused.set(index, (fused.get(index) ?? 0) + 1 / (RRF_K + rank + 1)));
	lexicalOrder.forEach((index, rank) => fused.set(index, (fused.get(index) ?? 0) + 1 / (RRF_K + rank + 1)));
	return items
		.map((item, index) => ({ item, index, fused: fused.get(index) ?? 0 }))
		.sort((a, b) => b.fused - a.fused || b.item.score - a.item.score)
		.map((entry) => entry.item);
}
