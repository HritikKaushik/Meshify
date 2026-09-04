import { useNavigate } from 'react-router-dom';
import { Pin, Sparkles, FolderGit2, Settings } from 'lucide-react';
import type { Project, ProjectStats } from '@/api';
import { projectColor } from '@/lib/project-color';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * Project card (design 4b). Everything shown is real: name, status, a knowledge
 * coverage ring (share of documents embedded — from GetProjectStats), repo /
 * document counts, sync state, and last activity. The design's team-avatar
 * stack has no per-project membership backend yet, so it is omitted rather than
 * faked. Hover reveals real navigations (Open / Ask / Repo / Settings). Pinning
 * is a local user preference.
 */
export function ProjectCard({
	project,
	stats,
	pinned,
	onTogglePin,
}: {
	project: Project;
	stats?: ProjectStats;
	pinned: boolean;
	onTogglePin: (id: string) => void;
}) {
	const navigate = useNavigate();
	const color = projectColor(project.id);
	const open = () => navigate(`/projects/${project.id}`);

	const coveragePct = stats && stats.coverage !== null ? Math.round(stats.coverage * 100) : null;
	const indexing =
		!!stats &&
		((stats.repositories.total > 0 && stats.repositories.synced < stats.repositories.total) ||
			(stats.documents.total > 0 && stats.documents.embedded < stats.documents.total));
	const syncLabel = !stats
		? '—'
		: stats.repositories.total === 0
			? 'No repos'
			: stats.repositories.synced === stats.repositories.total
				? 'Synced'
				: 'Syncing';

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={open}
			onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
			className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-mc-border bg-mc-card px-5 pt-5 pb-[70px] text-left shadow-e2 transition-all hover:-translate-y-0.5 hover:border-mc-accent/25 hover:shadow-glow-accent"
		>
			{/* header */}
			<div className="flex items-center gap-2.5">
				<span className="h-[9px] w-[9px] flex-none rounded-sm" style={{ background: color }} />
				<span className="flex-1 truncate text-[16px] font-semibold text-mc-text">{project.name}</span>
				{indexing ? (
					<span className="flex items-center gap-1.5 rounded-full bg-mc-accent/[.12] px-2.5 py-1 font-mono text-[10px] font-medium text-mc-accent-lo">
						<span className="h-[5px] w-[5px] animate-meshpulse rounded-full bg-mc-accent" /> INDEXING
					</span>
				) : (
					<span className="flex items-center gap-1.5 rounded-full bg-mc-success/[.12] px-2.5 py-1 font-mono text-[10px] font-medium text-mc-success-lo">
						<span className="h-[5px] w-[5px] rounded-full bg-mc-success" /> AI HEALTHY
					</span>
				)}
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

			{/* body: coverage ring + counts */}
			<div className="mt-[18px] flex items-center gap-5">
				<CoverageRing pct={coveragePct} color={color} />
				<div className="flex flex-1 flex-col gap-2.5">
					<div className="flex gap-6">
						<Stat label="Repos" value={stats ? String(stats.repositories.total) : '—'} />
						<Stat label="Documents" value={stats ? String(stats.documents.total) : '—'} />
						<Stat label="Sync" value={syncLabel} valueClass={syncLabel === 'Synced' ? 'text-mc-success' : undefined} />
					</div>
					<div className="text-[11.5px] text-mc-muted-2">
						{stats?.lastActivityAt ? `Last activity ${timeAgo(stats.lastActivityAt)}` : `Updated ${timeAgo(project.updatedAt)}`}
					</div>
				</div>
			</div>

			{/* hover action overlay */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center gap-2 border-t border-mc-hairline bg-gradient-to-t from-mc-card to-mc-card/80 px-4 py-3 opacity-0 backdrop-blur-sm transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
				<button
					onClick={(e) => { e.stopPropagation(); void open(); }}
					className="flex-1 rounded-full bg-mc-accent py-2 text-[11.5px] font-semibold text-white shadow-glow-accent transition-colors hover:bg-mc-accent-hi"
				>
					Open Workspace
				</button>
				<OverlayIcon title="Ask Mesh" onClick={(e) => { e.stopPropagation(); void navigate(`/projects/${project.id}/chat`); }} accent>
					<Sparkles className="h-3.5 w-3.5" />
				</OverlayIcon>
				<OverlayIcon title="Repository" onClick={(e) => { e.stopPropagation(); void navigate(`/projects/${project.id}/repository`); }}>
					<FolderGit2 className="h-3.5 w-3.5" />
				</OverlayIcon>
				<OverlayIcon title="Settings" onClick={(e) => { e.stopPropagation(); void navigate(`/projects/${project.id}/settings`); }}>
					<Settings className="h-3.5 w-3.5" />
				</OverlayIcon>
			</div>
		</div>
	);
}

function CoverageRing({ pct, color }: { pct: number | null; color: string }) {
	const value = pct ?? 0;
	return (
		<div
			className="relative flex h-[62px] w-[62px] flex-none items-center justify-center rounded-full"
			style={{ background: `conic-gradient(${color} 0% ${value}%, hsl(var(--mc-border)) ${value}% 100%)` }}
		>
			<div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-mc-card shadow-[inset_0_0_0_1px_hsl(var(--mc-border))]">
				<span className="text-[15px] font-semibold text-mc-text">{pct === null ? '—' : `${pct}%`}</span>
			</div>
		</div>
	);
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
	return (
		<div>
			<div className="text-[10px] font-medium text-mc-muted-2">{label}</div>
			<div className={cn('text-[15px] font-semibold text-mc-text-2', valueClass)}>{value}</div>
		</div>
	);
}

function OverlayIcon({ children, title, onClick, accent }: { children: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void; accent?: boolean }) {
	return (
		<button
			title={title}
			onClick={onClick}
			className={cn(
				'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
				accent ? 'border-mc-purple/25 bg-mc-card text-mc-purple-lo hover:bg-mc-purple/[.1]' : 'border-mc-border bg-mc-card text-mc-text-3 hover:text-mc-text'
			)}
		>
			{children}
		</button>
	);
}
