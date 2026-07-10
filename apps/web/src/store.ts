import { useEffect, useState } from 'react';
import type { Project } from './api';

// localStorage-backed state. This is a DEV console: the API key lives in the
// browser for convenience — the real Phase II app would not do this.

const KEY_CONFIG = 'meshify.config';
const KEY_PROJECTS = 'meshify.projects';

export interface StoredConfig {
	baseUrl: string;
	apiKey: string;
}

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

/** A localStorage-persisted piece of state, same signature as useState. */
export function usePersistent<T>(key: string, fallback: T): [T, (v: T) => void] {
	const [value, setValue] = useState<T>(() => read(key, fallback));
	useEffect(() => {
		localStorage.setItem(key, JSON.stringify(value));
	}, [key, value]);
	return [value, setValue];
}

export function useConfig() {
	// baseUrl '' → same-origin (the Vite dev proxy forwards to the API).
	return usePersistent<StoredConfig>(KEY_CONFIG, { baseUrl: '', apiKey: '' });
}

/** The API has no list-projects endpoint, so we remember the ones created here. */
export interface KnownProject {
	id: string;
	name: string;
}

export function useKnownProjects() {
	const [projects, setProjects] = usePersistent<KnownProject[]>(KEY_PROJECTS, []);
	const add = (p: Project) => {
		if (!projects.some((x) => x.id === p.id)) setProjects([{ id: p.id, name: p.name }, ...projects]);
	};
	const remove = (id: string) => setProjects(projects.filter((x) => x.id !== id));
	return { projects, add, remove };
}
