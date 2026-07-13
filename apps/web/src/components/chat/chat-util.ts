import type { ChatCitation } from '@/api';

/**
 * A single rendered turn in the thread. Flat fields (rather than the raw
 * ChatResponse) so both a live answer and a loaded-from-history assistant
 * message populate the same shape. `confidence` is only present on live answers
 * — the backend doesn't persist it per message, so replayed history omits it
 * (shown honestly as "—" rather than invented).
 */
export interface Turn {
	role: 'user' | 'assistant';
	content: string;
	/** True only for a freshly-sent live answer — gates the typewriter reveal. */
	live?: boolean;
	confidence?: number;
	citations?: ChatCitation[];
	latencyMs?: number | null;
	modelUsed?: string | null;
	tokensTotal?: number | null;
}

const CODE_EXT = /\.(ts|tsx|js|jsx|py|rs|go|java|rb|c|cc|cpp|h|hpp|cs|php|kt|swift|scala|sql|sh|yaml|yml|toml|json)$/i;

export function isCodeSource(path: string): boolean {
	return CODE_EXT.test(path);
}

export function confidenceLabel(c: number): string {
	if (c >= 0.7) return 'high confidence';
	if (c >= 0.4) return 'medium confidence';
	return 'low confidence';
}
