import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, RotateCw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { estimateEtaMs, formatDuration, isTerminal, jobPresentation, type JobView } from './job-model';

/**
 * Generic background-job card — one component for every job type (Documents,
 * GitHub, Slack, and future sources). All type-specific display comes from
 * jobPresentation(jobType); the card itself is driven purely by the JobView.
 */
export function JobCard({ view, now }: { view: JobView; now: number }) {
	const [expanded, setExpanded] = useState(false);
	const { label } = jobPresentation(view.jobType);

	const done = view.phase === 'completed';
	const failed = view.phase === 'failed';
	const retry = view.phase === 'retry';
	const active = !isTerminal(view.phase) && !retry;

	const percent = done ? 100 : view.percent;
	const indeterminate = active && percent == null;
	const elapsed = formatDuration(now - view.startedAt);
	const etaMs = active ? estimateEtaMs(view, now) : null;

	const accent = failed ? 'bg-mc-danger' : done ? 'bg-mc-success' : retry ? 'bg-mc-amber' : 'bg-mc-accent';

	return (
		<div className="rounded-xl border border-black/[.06] bg-white/95 p-3 shadow-[0_1px_3px_rgba(16,24,40,.05)]">
			<button onClick={() => setExpanded((v) => !v)} className="flex w-full items-start gap-2.5 text-left">
				<span className={cn('mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg', failed ? 'bg-mc-danger/10 text-mc-danger' : done ? 'bg-mc-success/10 text-mc-success' : 'bg-mc-accent/10 text-mc-accent')}>
					{done ? <Check className="h-3.5 w-3.5" /> : failed ? <TriangleAlert className="h-3.5 w-3.5" /> : retry ? <RotateCw className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="flex items-center gap-1.5">
						<span className="truncate text-[13px] font-medium text-mc-text">{view.title}</span>
						{expanded ? <ChevronDown className="h-3 w-3 flex-none text-mc-muted" /> : <ChevronRight className="h-3 w-3 flex-none text-mc-muted" />}
					</div>
					<span className="truncate text-[11.5px] text-mc-text-3">
						{done ? 'Completed successfully' : failed ? view.error ?? 'Failed' : retry ? 'Retrying…' : view.stage ?? label}
					</span>
				</div>
				{percent != null && !failed && <span className="flex-none font-mono text-[11px] tabular-nums text-mc-text-3">{Math.round(percent)}%</span>}
			</button>

			{/* Progress bar */}
			<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-mc-raised">
				{indeterminate ? (
					<div className={cn('h-full w-1/3 rounded-full', accent)} style={{ animation: 'mc-indeterminate 1.2s ease-in-out infinite' }} />
				) : (
					<div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', accent)} style={{ width: `${percent ?? 0}%` }} />
				)}
			</div>

			{/* Meta line */}
			<div className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-mc-muted">
				<span>{label}</span>
				<span>·</span>
				<span>{elapsed} elapsed</span>
				{etaMs != null && (
					<>
						<span>·</span>
						<span>~{formatDuration(etaMs)} left</span>
					</>
				)}
			</div>

			{expanded && (
				<div className="mt-2 flex flex-col gap-1 rounded-lg border border-black/[.05] bg-mc-surface p-2 font-mono text-[10.5px] text-mc-text-3">
					<div className="flex justify-between gap-3">
						<span className="text-mc-muted">Stage</span>
						<span className="truncate">{view.stage ?? '—'}</span>
					</div>
					<div className="flex justify-between gap-3">
						<span className="text-mc-muted">Job ID</span>
						<span className="truncate">{view.jobId}</span>
					</div>
					<div className="flex justify-between gap-3">
						<span className="text-mc-muted">Updated</span>
						<span>{new Date(view.updatedAt).toLocaleTimeString()}</span>
					</div>
					{view.error && <div className="mt-0.5 whitespace-pre-wrap break-words text-mc-danger">{view.error}</div>}
				</div>
			)}
		</div>
	);
}
