import { useEffect } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FolderGit2, FileText, SearchCode, FlaskConical } from 'lucide-react';
import { api } from '@/api-client';
import { useAsync } from '@/ui';
import type { Project } from '@/api';
import { projectColor } from '@/lib/project-color';
import { Kicker } from '@/components/mc/primitives';
import { cn } from '@/lib/utils';

const TABS = [
	{ to: 'home', label: 'Home', icon: LayoutDashboard },
	{ to: 'chat', label: 'Mesh Chat', icon: MessageSquare },
	{ to: 'repository', label: 'Repository', icon: FolderGit2 },
	{ to: 'documents', label: 'Documents', icon: FileText },
	{ to: 'search', label: 'Search', icon: SearchCode },
	{ to: 'evaluation', label: 'Evaluation', icon: FlaskConical },
] as const;

/** Loads the active project and renders the Mission Control per-project sub-nav + nested route. */
export function ProjectWorkspaceShell() {
	const { projectId } = useParams<{ projectId: string }>();
	const project = useAsync<Project>();

	useEffect(() => {
		if (projectId) void project.run(() => api.getProject(projectId));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectId]);

	if (project.state.status === 'pending' || project.state.status === 'idle') {
		return <p className="text-sm text-mc-text-2">Loading project…</p>;
	}
	if (project.state.status === 'error') {
		return <p className="text-sm text-mc-danger">Couldn't load this project — it may not exist, or you don't have access to it.</p>;
	}

	const p = project.state.value;

	return (
		<div>
			<div className="mb-5 flex items-start gap-3">
				<span className="mt-1.5 h-4 w-4 flex-none rounded-md" style={{ background: projectColor(p.id) }} />
				<div className="flex flex-col gap-1">
					<Kicker>// PROJECT</Kicker>
					<h1 className="text-2xl font-semibold tracking-tight text-mc-text">{p.name}</h1>
					<p className="font-mono text-xs text-mc-muted">{p.id}</p>
				</div>
			</div>

			<nav className="flex gap-1 overflow-x-auto border-b border-white/[.06]">
				{TABS.map((tab) => (
					<NavLink
						key={tab.to}
						to={tab.to}
						className={({ isActive }) =>
							cn(
								'flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-mc-text-2 transition-colors hover:text-mc-text',
								isActive && 'border-mc-accent text-mc-text'
							)
						}
					>
						<tab.icon className="h-3.5 w-3.5" />
						{tab.label}
					</NavLink>
				))}
			</nav>

			<div className="mt-5">
				<Outlet context={{ project: p, projectId: p.id }} />
			</div>
		</div>
	);
}
