import { useEffect } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Search, Settings, Building2 } from 'lucide-react';
import { api } from '@/api-client';
import { useAsync } from '@/ui';
import type { Project } from '@/api';
import { projectColor } from '@/lib/project-color';
import { Atmosphere } from '@/components/mc/Atmosphere';
import { MeshLogo, MeshPill, StatusDot } from '@/components/mc/primitives';
import { cn } from '@/lib/utils';

/**
 * Mission Control app shell: glass sidebar (real project list) + top bar
 * (breadcrumb, Mesh status, Clerk user menu) over an atmosphere backdrop.
 * Wraps every authenticated route (/dashboard and /projects/*).
 */
export function AppShell() {
	const { projectId } = useParams<{ projectId: string }>();
	const projects = useAsync<Project[]>();

	useEffect(() => {
		void projects.run(() => api.listProjects());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const list = projects.state.status === 'success' ? projects.state.value : [];
	const active = list.find((p) => p.id === projectId);

	return (
		<div className="flex h-screen overflow-hidden bg-mc-bg text-mc-text">
			{/* Sidebar */}
			<aside className="z-10 flex w-64 flex-none flex-col gap-1 border-r border-white/[.06] bg-[rgba(10,10,14,.72)] px-3 py-4 backdrop-blur-[14px]">
				<Link to="/home" className="flex items-center gap-2.5 px-2 pb-4 pt-1">
					<MeshLogo size={26} />
					<div className="flex flex-col">
						<span className="text-[13px] font-semibold tracking-tight">Meshify</span>
						<span className="font-mono text-[9.5px] tracking-[0.06em] text-mc-muted-2">MISSION CONTROL</span>
					</div>
				</Link>

				<div className="flex items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.03] px-2.5 py-2 text-mc-muted-2">
					<Search className="h-3.5 w-3.5" />
					<span className="flex-1 text-xs">Search projects…</span>
				</div>

				<div className="px-2 pb-1.5 pt-4 font-mono text-[10px] tracking-[0.11em] text-mc-muted-2">PROJECTS</div>
				<nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
					{projects.state.status === 'pending' && <div className="px-2 py-1 text-xs text-mc-muted-2">Loading…</div>}
					{projects.state.status === 'success' && list.length === 0 && (
						<div className="px-2 py-1 text-xs text-mc-muted-2">No projects yet.</div>
					)}
					{list.map((p) => (
						<NavLink
							key={p.id}
							to={`/projects/${p.id}`}
							className={({ isActive }) =>
								cn(
									'flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors',
									isActive ? 'border border-mc-accent/[.18] bg-gradient-to-r from-mc-accent/[.12] to-transparent' : 'hover:bg-white/[.03]'
								)
							}
						>
							<span className="h-[7px] w-[7px] rounded-sm" style={{ background: projectColor(p.id) }} />
							<span className={cn('flex-1 truncate text-[13px]', p.id === projectId ? 'font-medium text-mc-text' : 'text-mc-text-2')}>{p.name}</span>
							<StatusDot color={p.status === 'active' ? 'success' : 'muted'} glow={p.status === 'active'} />
						</NavLink>
					))}
				</nav>

				<Link to="/home" className="px-2 py-1.5 text-xs text-mc-muted-2 hover:text-mc-text-2">
					All projects →
				</Link>

				<div className="mt-1 flex flex-col gap-0.5 border-t border-white/[.06] pt-2.5">
					<div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-mc-text-2 hover:bg-white/[.03]">
						<Settings className="h-3.5 w-3.5 text-mc-muted-2" />
						<span className="text-[13px]">Settings</span>
					</div>
					<div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-mc-text-2 hover:bg-white/[.03]">
						<Building2 className="h-3.5 w-3.5 text-mc-muted-2" />
						<span className="text-[13px]">Organization</span>
					</div>
				</div>
			</aside>

			{/* Main column */}
			<div className="relative flex min-w-0 flex-1 flex-col">
				{/* Top bar */}
				<header className="z-10 flex flex-none items-center gap-4 border-b border-white/[.06] bg-[rgba(8,8,11,.6)] px-6 py-3 backdrop-blur-[14px]">
					<div className="flex items-center gap-2 text-[12.5px] text-mc-muted-2">
						<Link to="/home" className="hover:text-mc-text-2">
							Meshify
						</Link>
						{active && (
							<>
								<span className="text-mc-muted">/</span>
								<span className="font-medium text-mc-text">{active.name}</span>
								<span className="ml-1 flex items-center gap-1.5 rounded-full bg-mc-success/[.09] px-2 py-0.5 font-mono text-[10px] text-mc-success">
									<StatusDot color="success" glow /> {active.status.toUpperCase()}
								</span>
							</>
						)}
					</div>
					<div className="flex-1" />
					<MeshPill>Mesh · online</MeshPill>
					<UserButton afterSignOutUrl="/" />
				</header>

				{/* Scrollable content with atmosphere */}
				<div className="relative min-h-0 flex-1 overflow-y-auto">
					<Atmosphere stars />
					<div className="relative mx-auto max-w-7xl px-6 pb-16 pt-6">
						<Outlet context={{ projects: list, refreshProjects: () => projects.run(() => api.listProjects()) }} />
					</div>
				</div>
			</div>
		</div>
	);
}
