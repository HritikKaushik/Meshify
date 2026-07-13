import { useMemo } from 'react';
import { Plus, Sparkles, Activity } from 'lucide-react';
import type { Project } from '@/api';
import { usePersistent } from '@/store';
import { useOrg } from '@/components/layout/OrgShell';
import { StatTile } from '@/components/project-home/StatTile';
import { ProjectCard } from '@/components/project-home/ProjectCard';
import { GlassCard, Kicker } from '@/components/mc/primitives';
import { SectionHeading } from '@/components/common/SectionHeading';

/**
 * Project Home (design 3b) — the org dashboard and post-login default. Real
 * project data drives the stat tiles and project cards; pinning is a local
 * user preference. The design's org-level widgets (activity feed, indexing
 * jobs, AI suggestions, coverage %) have no backend yet, so they are shown as
 * honest "coming soon" states rather than fabricated numbers.
 */
export function DashboardPage() {
	const { projects, loading, openCreate } = useOrg();
	const [pinnedIds, setPinnedIds] = usePersistent<string[]>('meshify.pinnedProjects', []);

	const togglePin = (id: string) =>
		setPinnedIds(pinnedIds.includes(id) ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id]);

	const weekAgo = Date.now() - 7 * 864e5;
	const { pinned, recent, activeCount, updatedThisWeek } = useMemo(() => {
		const byRecent = [...projects].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
		return {
			pinned: byRecent.filter((p) => pinnedIds.includes(p.id)),
			recent: byRecent,
			activeCount: projects.filter((p) => p.status === 'active').length,
			updatedThisWeek: projects.filter((p) => +new Date(p.updatedAt) > weekAgo).length,
		};
	}, [projects, pinnedIds, weekAgo]);

	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
			{/* Main column */}
			<div className="flex min-w-0 flex-col gap-6">
				<div className="flex flex-col gap-1.5">
					<Kicker>// WORKSPACE</Kicker>
					<h1 className="text-2xl font-semibold tracking-tight text-mc-text">Your workspace</h1>
					<p className="text-sm text-mc-text-3">
						{loading ? 'Loading projects…' : `${projects.length} project${projects.length === 1 ? '' : 's'} · each an isolated, RAG-queryable knowledge base.`}
					</p>
				</div>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					<StatTile label="PROJECTS" value={projects.length} />
					<StatTile label="ACTIVE" value={activeCount} accent="success" sub={activeCount === projects.length && projects.length > 0 ? 'all healthy' : undefined} />
					<StatTile label="UPDATED · 7D" value={updatedThisWeek} accent="indexing" />
				</div>

				{pinned.length > 0 && (
					<Section title="PINNED">
						<CardGrid projects={pinned} pinnedIds={pinnedIds} onTogglePin={togglePin} />
					</Section>
				)}

				<Section title={pinned.length > 0 ? 'ALL PROJECTS' : 'PROJECTS'}>
					{!loading && projects.length === 0 ? (
						<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[.1] py-16 text-center">
							<p className="text-sm text-mc-text-3">No projects yet.</p>
							<button onClick={openCreate} className="flex items-center gap-1.5 text-sm text-mc-accent hover:text-mc-accent-hi">
								<Plus className="h-3.5 w-3.5" /> Create your first project
							</button>
						</div>
					) : (
						<CardGrid projects={recent} pinnedIds={pinnedIds} onTogglePin={togglePin} />
					)}
				</Section>
			</div>

			{/* Right rail — quick start (real) + honest placeholders for unbacked org widgets */}
			<aside className="flex flex-col gap-4">
				<GlassCard className="flex flex-col gap-3 p-4">
					<Kicker>GET STARTED</Kicker>
					<button onClick={openCreate} className="flex items-center gap-2.5 rounded-lg border border-mc-accent/25 bg-mc-accent/[.08] px-3 py-2.5 text-left text-[13px] font-medium text-mc-accent-hi transition-colors hover:bg-mc-accent/[.14]">
						<Plus className="h-4 w-4" /> New project
					</button>
					<p className="text-[12px] leading-relaxed text-mc-text-3">
						Open a project to connect a repository, upload documents, and ask Mesh grounded, cited questions.
					</p>
				</GlassCard>

				<GlassCard className="flex flex-col gap-2.5 p-4">
					<div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-mc-muted-2" /><Kicker>ACTIVITY</Kicker></div>
					<p className="text-[12px] leading-relaxed text-mc-text-3">
						Org-wide activity (uploads, syncs, indexing) will appear here once activity tracking ships. Per-project status is live inside each workspace.
					</p>
				</GlassCard>

				<GlassCard className="flex flex-col gap-2.5 p-4">
					<div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-mc-accent" /><Kicker>AI SUGGESTIONS</Kicker></div>
					<p className="text-[12px] leading-relaxed text-mc-text-3">
						Mesh surfaces documentation gaps and drift inside each project. Open a project and ask Mesh to get started.
					</p>
				</GlassCard>
			</aside>
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-3">
			<SectionHeading divider>{title}</SectionHeading>
			{children}
		</div>
	);
}

function CardGrid({ projects, pinnedIds, onTogglePin }: { projects: Project[]; pinnedIds: string[]; onTogglePin: (id: string) => void }) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{projects.map((p) => (
				<ProjectCard key={p.id} project={p} pinned={pinnedIds.includes(p.id)} onTogglePin={onTogglePin} />
			))}
		</div>
	);
}
