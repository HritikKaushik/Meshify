import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import type { Project, ProjectStats } from '@/api';
import { api } from '@/api-client';
import { usePersistent } from '@/store';
import { useOrg } from '@/components/layout/OrgShell';
import { ProjectCard } from '@/components/project-home/ProjectCard';
import { Kicker } from '@/components/mc/primitives';
import { SectionHeading } from '@/components/common/SectionHeading';

function greeting(): string {
	const h = new Date().getHours();
	if (h < 12) return 'Good morning';
	if (h < 18) return 'Good afternoon';
	return 'Good evening';
}

/**
 * Project Home (design 4b) — the org dashboard and post-login default: a
 * greeting, real org-wide stats, and the project grid. Stats (repositories,
 * documents, knowledge coverage, active conversations) are aggregated from the
 * per-project GetProjectStats endpoint — all real. The design's right rail
 * (AI suggestions / indexing feed / recent activity) has no backend yet and is
 * intentionally omitted rather than faked; pinning is a local preference.
 */
export function DashboardPage() {
	const { projects, loading, openCreate } = useOrg();
	const { user } = useUser();
	const [pinnedIds, setPinnedIds] = usePersistent<string[]>('meshify.pinnedProjects', []);
	const [stats, setStats] = useState<Record<string, ProjectStats>>({});

	const togglePin = (id: string) =>
		setPinnedIds(pinnedIds.includes(id) ? pinnedIds.filter((x) => x !== id) : [...pinnedIds, id]);

	// Fetch each project's real stats in parallel; tolerate individual failures.
	useEffect(() => {
		let cancelled = false;
		if (projects.length === 0) return;
		void Promise.all(
			projects.map(async (p) => {
				try {
					return [p.id, await api.getProjectStats(p.id)] as const;
				} catch {
					return null;
				}
			})
		).then((entries) => {
			if (cancelled) return;
			setStats(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, ProjectStats]>));
		});
		return () => {
			cancelled = true;
		};
	}, [projects]);

	const org = useMemo(() => {
		const values = Object.values(stats);
		const repositories = values.reduce((n, s) => n + s.repositories.total, 0);
		const conversations = values.reduce((n, s) => n + s.conversations, 0);
		const totalDocs = values.reduce((n, s) => n + s.documents.total, 0);
		const embedded = values.reduce((n, s) => n + s.documents.embedded, 0);
		const coverage = totalDocs > 0 ? Math.round((embedded / totalDocs) * 100) : null;
		return { repositories, conversations, coverage };
	}, [stats]);

	const sorted = useMemo(
		() => [...projects].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
		[projects]
	);
	const pinned = sorted.filter((p) => pinnedIds.includes(p.id));

	return (
		<div className="flex flex-col gap-7">
			{/* Greeting */}
			<div className="flex flex-wrap items-end gap-4">
				<div>
					<Kicker className="text-mc-accent">{(user?.firstName ? `${user.firstName}'s` : 'Rocketride') + ' workspace'}</Kicker>
					<h1 className="mt-2 text-[34px] font-semibold leading-tight tracking-[-.03em] text-mc-accent">
						{greeting()}
						{user?.firstName ? `, ${user.firstName}` : ''}
					</h1>
				</div>
				<div className="flex-1" />
				<button
					onClick={openCreate}
					className="flex items-center gap-2 rounded-full bg-mc-accent px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-glow-accent transition-colors hover:bg-mc-accent-hi"
				>
					<Plus className="h-3.5 w-3.5" /> New project
				</button>
			</div>

			{/* Inline org stats */}
			<div className="flex flex-wrap items-center gap-y-4 border-b border-mc-border pb-6">
				<InlineStat value={projects.length} label="Projects" first />
				<Divider />
				<InlineStat value={org.repositories} label="Repositories" />
				<Divider />
				<InlineStat value={org.coverage === null ? '—' : `${org.coverage}%`} label="Knowledge coverage" accent="success" />
				<Divider />
				<InlineStat value={org.conversations} label="Active conversations" accent="accent" />
			</div>

			{/* Pinned */}
			{pinned.length > 0 && (
				<Section title="Pinned projects">
					<Grid projects={pinned} stats={stats} pinnedIds={pinnedIds} onTogglePin={togglePin} />
				</Section>
			)}

			{/* All projects */}
			<Section title={pinned.length > 0 ? 'All projects' : 'Projects'}>
				{!loading && projects.length === 0 ? (
					<div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-mc-border bg-mc-card py-16 text-center">
						<p className="text-sm text-mc-text-3">No projects yet.</p>
						<button onClick={openCreate} className="flex items-center gap-1.5 text-sm font-medium text-mc-accent hover:text-mc-accent-lo">
							<Plus className="h-3.5 w-3.5" /> Create your first project
						</button>
					</div>
				) : (
					<Grid projects={sorted} stats={stats} pinnedIds={pinnedIds} onTogglePin={togglePin} />
				)}
			</Section>
		</div>
	);
}

function InlineStat({ value, label, accent, first }: { value: React.ReactNode; label: string; accent?: 'success' | 'accent'; first?: boolean }) {
	const color = accent === 'success' ? 'text-mc-success' : accent === 'accent' ? 'text-mc-accent' : 'text-mc-text';
	return (
		<div className={first ? 'pr-8' : 'px-8'}>
			<div className={`text-[28px] font-semibold tracking-[-.02em] ${color}`}>{value}</div>
			<div className="mt-0.5 text-[12px] text-mc-muted">{label}</div>
		</div>
	);
}

function Divider() {
	return <div className="h-[38px] w-px bg-mc-border" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-3.5">
			<SectionHeading>{title}</SectionHeading>
			{children}
		</div>
	);
}

function Grid({ projects, stats, pinnedIds, onTogglePin }: { projects: Project[]; stats: Record<string, ProjectStats>; pinnedIds: string[]; onTogglePin: (id: string) => void }) {
	return (
		<div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
			{projects.map((p) => (
				<ProjectCard key={p.id} project={p} stats={stats[p.id]} pinned={pinnedIds.includes(p.id)} onTogglePin={onTogglePin} />
			))}
		</div>
	);
}
