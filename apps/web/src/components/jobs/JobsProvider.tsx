import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { api } from '@/api-client';
import type { JobEvent } from '@/api';
import { initialJobsState, isTerminal, jobsReducer, type JobView } from './job-model';

/** How long a completed/failed job lingers in the active list (showing its final state) before moving to History. */
const LINGER_MS = 6000;

interface JobsContextValue {
	active: JobView[];
	history: JobView[];
	activeCount: number;
	/** The most recent event — pages use it to refresh their own lists when a relevant job completes. */
	lastEvent: JobEvent | null;
	open: boolean;
	setOpen: (open: boolean) => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

/**
 * Owns the ONE real-time job connection for the active project: seeds from the
 * snapshot endpoint, then streams live JobEvents over SSE (auto-reconnecting via
 * EventSource). Reduces events into active jobs + history and drives the Job
 * Progress Center. This replaces per-page polling — nothing else fetches job state.
 */
export function JobsProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
	const [state, dispatch] = useReducer(jobsReducer, initialJobsState);
	const [lastEvent, setLastEvent] = useState<JobEvent | null>(null);
	const [open, setOpen] = useState(false);
	const archiveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	useEffect(() => {
		let cancelled = false;
		const timers = archiveTimers.current;

		// 1) Snapshot: current active jobs + recent history for instant first paint.
		void api
			.listJobs(projectId)
			.then((snapshot) => {
				if (!cancelled) dispatch({ type: 'snapshot', active: snapshot.active, recent: snapshot.recent });
			})
			.catch(() => undefined);

		// 2) Live stream (cookie auth flows through the same-origin BFF; EventSource reconnects automatically).
		const source = new EventSource(api.jobsStreamUrl(projectId), { withCredentials: true });
		source.onmessage = (message) => {
			let event: JobEvent;
			try {
				event = JSON.parse(message.data) as JobEvent;
			} catch {
				return;
			}
			dispatch({ type: 'event', event });
			setLastEvent(event);
			// Terminal jobs linger briefly with their final state, then drop into History.
			if (isTerminal(event.phase)) {
				const existing = timers.get(event.jobId);
				if (existing) clearTimeout(existing);
				timers.set(
					event.jobId,
					setTimeout(() => {
						dispatch({ type: 'archive', jobId: event.jobId });
						timers.delete(event.jobId);
					}, LINGER_MS)
				);
			}
		};

		return () => {
			cancelled = true;
			source.close();
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
		};
	}, [projectId]);

	const value = useMemo<JobsContextValue>(() => {
		const active = Object.values(state.active).sort((a, b) => b.startedAt - a.startedAt);
		return { active, history: state.history, activeCount: active.filter((j) => !isTerminal(j.phase)).length, lastEvent, open, setOpen };
	}, [state, lastEvent, open]);

	return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

/** Access the real-time jobs state. Returns null-safe empty state when used outside a JobsProvider. */
export function useJobs(): JobsContextValue {
	const ctx = useContext(JobsContext);
	if (!ctx) return { active: [], history: [], activeCount: 0, lastEvent: null, open: false, setOpen: () => {} };
	return ctx;
}
