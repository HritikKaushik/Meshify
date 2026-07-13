import { useEffect, useState } from 'react';

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

/**
 * A localStorage-persisted piece of state, same signature as useState. Now
 * used only for minor UI preferences (e.g. last-used search mode) — auth
 * state lives in the Clerk session, and the project list comes from the
 * real GET /api/v1/projects call instead of a client-remembered cache.
 */
export function usePersistent<T>(key: string, fallback: T): [T, (v: T) => void] {
	const [value, setValue] = useState<T>(() => read(key, fallback));
	useEffect(() => {
		localStorage.setItem(key, JSON.stringify(value));
	}, [key, value]);
	return [value, setValue];
}
