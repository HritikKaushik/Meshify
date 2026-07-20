import { useEffect, useState } from 'react';
import { Activity, ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useJobs } from './JobsProvider';
import { JobCard } from './JobCard';

/**
 * Global Job Progress Center — a persistent, floating panel (à la GitHub
 * Desktop / Vercel) that surfaces every background operation for the active
 * project in real time. Collapses to a launcher pill; auto-subscribes to the
 * SSE stream via JobsProvider. Replaces transient toasts for background work.
 */
export function JobProgressCenter() {
	const { active, history, activeCount, open, setOpen } = useJobs();
	const [now, setNow] = useState(() => Date.now());
	const [showHistory, setShowHistory] = useState(false);

	// One shared 1s tick drives elapsed/ETA across all cards.
	useEffect(() => {
		if (!open && activeCount === 0) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [open, activeCount]);

	const hasAnything = active.length > 0 || history.length > 0;
	if (!hasAnything) return null;

	if (!open) {
		return (
			<button
				onClick={() => setOpen(true)}
				className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-mc-border bg-mc-card px-3.5 py-2 text-[12.5px] font-medium text-mc-text shadow-e3 transition-transform hover:-translate-y-0.5"
			>
				{activeCount > 0 ? <Loader2 className="h-4 w-4 animate-spin text-mc-accent" /> : <Activity className="h-4 w-4 text-mc-text-3" />}
				{activeCount > 0 ? `${activeCount} running` : 'Background jobs'}
			</button>
		);
	}

	return (
		<div className="fixed bottom-5 right-5 z-40 flex max-h-[72vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-mc-border bg-mc-card/95 shadow-e4 backdrop-blur-xl animate-fade">
			<header className="flex flex-none items-center gap-2 border-b border-mc-hairline px-4 py-3">
				<Activity className="h-4 w-4 text-mc-accent" />
				<span className="text-[13px] font-semibold text-mc-text">Background jobs</span>
				{activeCount > 0 && <span className="rounded-full bg-mc-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-mc-accent-lo">{activeCount} active</span>}
				<div className="flex-1" />
				<button onClick={() => setOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-lg text-mc-text-3 hover:bg-mc-surface hover:text-mc-text" title="Collapse">
					<X className="h-3.5 w-3.5" />
				</button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
				{active.length === 0 && <p className="px-1 py-6 text-center text-[12.5px] text-mc-text-3">No jobs running right now.</p>}
				{active.map((view) => (
					<JobCard key={view.jobId} view={view} now={now} />
				))}

				{history.length > 0 && (
					<div className="mt-1">
						<button onClick={() => setShowHistory((v) => !v)} className="flex w-full items-center gap-1.5 px-1 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-mc-muted hover:text-mc-text-3">
							<ChevronDown className={cn('h-3 w-3 transition-transform', showHistory ? '' : '-rotate-90')} />
							History ({history.length})
						</button>
						{showHistory && (
							<div className="mt-1 flex flex-col gap-2 opacity-90">
								{history.map((view) => (
									<JobCard key={view.jobId} view={view} now={now} />
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
