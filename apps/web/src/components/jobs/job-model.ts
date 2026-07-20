import { FileText, FolderGit2, MessagesSquare, Loader, type LucideIcon, RefreshCw } from 'lucide-react';
import type { JobEvent, JobPhase } from '@/api';

/** The generic view model every JobCard renders — one shape for Documents, GitHub, Slack, and any future source. */
export interface JobView {
	jobId: string;
	jobType: string;
	title: string;
	phase: JobPhase;
	stage?: string;
	percent?: number;
	error?: string;
	/** epoch ms of the first event seen for this job. */
	startedAt: number;
	/** epoch ms of the most recent event. */
	updatedAt: number;
}

export interface JobsState {
	active: Record<string, JobView>;
	history: JobView[];
}

export const initialJobsState: JobsState = { active: {}, history: [] };

export type JobsAction =
	| { type: 'snapshot'; active: JobEvent[]; recent: JobEvent[] }
	| { type: 'event'; event: JobEvent }
	| { type: 'archive'; jobId: string };

export const TERMINAL_PHASES: readonly JobPhase[] = ['completed', 'failed'];
export const isTerminal = (phase: JobPhase): boolean => TERMINAL_PHASES.includes(phase);

const HISTORY_LIMIT = 50;

function toView(event: JobEvent, prev?: JobView): JobView {
	const at = Date.parse(event.at) || Date.now();
	return {
		jobId: event.jobId,
		jobType: event.jobType,
		// A snapshot's generic title is refined by later live events; keep the best non-empty title.
		title: event.title || prev?.title || 'Background job',
		phase: event.phase,
		stage: event.stage ?? prev?.stage,
		percent: event.percent ?? prev?.percent,
		error: event.error ?? prev?.error,
		startedAt: prev?.startedAt ?? at,
		updatedAt: at,
	};
}

export function jobsReducer(state: JobsState, action: JobsAction): JobsState {
	switch (action.type) {
		case 'snapshot': {
			const active = { ...state.active };
			for (const e of action.active) active[e.jobId] = toView(e, active[e.jobId]);
			const known = new Set([...Object.keys(active), ...state.history.map((h) => h.jobId)]);
			const seeded = action.recent.filter((e) => isTerminal(e.phase) && !known.has(e.jobId)).map((e) => toView(e));
			return { active, history: [...seeded, ...state.history].slice(0, HISTORY_LIMIT) };
		}
		case 'event': {
			const active = { ...state.active, [action.event.jobId]: toView(action.event, state.active[action.event.jobId]) };
			return { ...state, active };
		}
		case 'archive': {
			const view = state.active[action.jobId];
			if (!view) return state;
			const active = { ...state.active };
			delete active[action.jobId];
			return { active, history: [view, ...state.history.filter((h) => h.jobId !== view.jobId)].slice(0, HISTORY_LIMIT) };
		}
	}
}

interface JobPresentation {
	label: string;
	icon: LucideIcon;
}

const PRESENTATION: Record<string, JobPresentation> = {
	ingest_document: { label: 'Document upload', icon: FileText },
	clone_repo: { label: 'Repository ingestion', icon: FolderGit2 },
	sync_repo: { label: 'Repository sync', icon: FolderGit2 },
	slack_ingest: { label: 'Slack ingestion', icon: MessagesSquare },
	slack_sync: { label: 'Slack sync', icon: MessagesSquare },
	source_sync: { label: 'Source sync', icon: RefreshCw },
};

export function jobPresentation(jobType: string): JobPresentation {
	return PRESENTATION[jobType] ?? { label: 'Background job', icon: Loader };
}

/** "18s", "2m 04s", "1h 3m" — compact human duration from ms. */
export function formatDuration(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
}

/** Naive ETA from progress velocity, or null when the stage is indeterminate. */
export function estimateEtaMs(view: JobView, now: number): number | null {
	if (view.percent == null || view.percent <= 0 || view.percent >= 100) return null;
	const elapsed = now - view.startedAt;
	if (elapsed <= 0) return null;
	return Math.round((elapsed / view.percent) * (100 - view.percent));
}
