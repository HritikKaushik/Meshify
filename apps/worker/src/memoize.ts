/**
 * Caches the result of an async factory for `ttlMs`. Concurrent callers
 * share the in-flight promise; a rejected call is not cached, so the next
 * caller retries. Used to keep a sync from re-reading (and decrypting) the
 * same vault credential on every API request it makes.
 */
export function memoizeForMs<T>(fn: () => Promise<T>, ttlMs: number, now: () => number = () => Date.now()): () => Promise<T> {
	let cached: { value: Promise<T>; expiresAt: number } | undefined;
	return () => {
		if (cached && cached.expiresAt > now()) return cached.value;
		const entry = { value: fn(), expiresAt: now() + ttlMs };
		cached = entry;
		entry.value.catch(() => {
			if (cached === entry) cached = undefined;
		});
		return entry.value;
	};
}
