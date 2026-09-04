import type { ChatHistoryTurn } from '@meshify/rocketride-gateway';

/** Words that only make sense with an earlier turn; a question built on them retrieves badly on its own. */
const ANAPHORA = /\b(it|its|that|this|these|those|they|them|their|he|she|his|her|same|above|previous|earlier|again|also|too|one|ones)\b/i;
const SHORT_QUESTION_WORDS = 6;

/**
 * The queries to embed for a chat turn. The question itself always retrieves.
 * When it reads like a follow-up ("and the second one?", "why does it fail?")
 * the previous user turn is prepended as a second query, so retrieval sees
 * the subject the user is still talking about. Both result sets are merged
 * by the caller; the question alone keeps working for turns that change
 * topic.
 */
export function buildRetrievalQueries(question: string, history: readonly ChatHistoryTurn[] = []): string[] {
	const trimmed = question.trim();
	const previousUserTurn = [...history].reverse().find((turn) => turn.role === 'user' && turn.content.trim().length > 0)?.content.trim();
	if (!previousUserTurn || previousUserTurn === trimmed) return [trimmed];
	const words = trimmed.split(/\s+/).filter(Boolean);
	const followUp = ANAPHORA.test(trimmed) || words.length <= SHORT_QUESTION_WORDS;
	return followUp ? [trimmed, `${previousUserTurn}\n${trimmed}`] : [trimmed];
}

/**
 * Maps the best retrieval score to a 0..1 confidence the UI can label. Raw
 * cosine similarity sits between ~0.2 (unrelated) and ~0.65 (a chunk that
 * answers the question) for the embedding models in use, so the raw value
 * read as "low confidence" even for an answer grounded in an exact match.
 * The ramp runs from the retrieval floor (below which chunks are not used at
 * all) to a "strong" score; a small weight on the runner-up rewards answers
 * that several chunks agree on.
 */
export function calibrateConfidence(scores: readonly number[], options: { floor: number; strong?: number }): number {
	const strong = options.strong ?? options.floor + 0.35;
	const ramp = (score: number) => Math.max(0, Math.min(1, (score - options.floor) / (strong - options.floor)));
	const top = scores[0];
	if (top === undefined) return 0;
	const second = scores[1];
	const confidence = second === undefined ? ramp(top) : 0.8 * ramp(top) + 0.2 * ramp(second);
	return Math.round(confidence * 100) / 100;
}
