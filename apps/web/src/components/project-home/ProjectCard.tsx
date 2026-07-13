import { useNavigate } from 'react-router-dom';
import { Pin, ArrowUpRight } from 'lucide-react';
import type { Project } from '@/api';
import { projectColor } from '@/lib/project-color';
import { timeAgo } from '@/lib/time';
import { StatusDot } from '@/components/mc/primitives';
import { cn } from '@/lib/utils';

/**
 * Project card (design 3b). Populated entirely from the real project record —
 * name, status, description, LLM profile, last-updated. The design's "coverage
 * ring" needs a per-project coverage metric the backend doesn't expose, so it's
 * intentionally omitted rather than faked; a status dot conveys health instead.
 * Pinning is a client-side preference (see usePinnedProjects), a real user
 * action persisted locally — not fabricated data.
 */
export function ProjectCard({
	project,
	pinned,
	onTogglePin,
}: {
	project: Project;
	pinned: boolean;
	onTogglePin: (id: string) => void;
}) {
	const navigate = useNavigate();
	const active = project.status === 'active';
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => navigate(`/projects/${project.id}`)}
			onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/projects/${project.id}`)}
			className="group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-xl border border-white/[.08] bg-white/[.02] p-4 text-left transition-all hover:border-mc-accent/40"
		>
			<div
				className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
				style={{ background: projectColor(project.id) }}
			/>
			<div className="relative flex items-center gap-2.5">
				<span className="h-[9px] w-[9px] flex-none rounded-sm" style={{ background: projectColor(project.id) }} />
				<span className="flex-1 truncate text-[15px] font-semibold text-mc-text">{project.name}</span>
				<span className="flex items-center gap-1.5 rounded-full bg-white/[.04] px-2 py-0.5 font-mono text-[9.5px] text-mc-text-2">
					<StatusDot color={active ? 'success' : 'muted'} glow={active} />
					{project.status.toUpperCase()}
				</span>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onTogglePin(project.id);
					}}
					title={pinned ? 'Unpin' : 'Pin'}
					className={cn('rounded-md p-1 transition-colors', pinned ? 'text-mc-accent' : 'text-mc-muted opacity-0 group-hover:opacity-100 hover:text-mc-text-2')}
				>
					<Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
				</button>
			</div>
			<p className="relative line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-mc-text-3">{project.description || 'No description.'}</p>
			<div className="relative flex items-center justify-between font-mono text-[11px] text-mc-muted">
				<span className="truncate">{project.llmProfile}</span>
				<span className="flex items-center gap-2">
					<span>Active {timeAgo(project.updatedAt)}</span>
					<ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
				</span>
			</div>
		</div>
	);
}
