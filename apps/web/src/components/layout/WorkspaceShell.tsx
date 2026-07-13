import { useCallback, useEffect } from 'react';
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { Bell, MessageSquare, LayoutDashboard, FolderGit2, FileText, SearchCode, FlaskConical, Settings } from 'lucide-react';
import { api } from '@/api-client';
import type { Conversation, Project } from '@/api';
import { useAsync } from '@/ui';
import { Atmosphere } from '@/components/mc/Atmosphere';
import { MeshPill, StatusDot } from '@/components/mc/primitives';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import type { WorkspaceContext } from '@/lib/workspace-context';
import { cn } from '@/lib/utils';

// Chat leads (primary); the rest is secondary navigation.
const TABS = [
	{ to: 'chat', label: 'Mesh Chat', icon: MessageSquare },
	{ to: 'overview', label: 'Overview', icon: LayoutDashboard },
	{ to: 'repository', label: 'Repository', icon: FolderGit2 },
	{ to: 'documents', label: 'Documents', icon: FileText },
	{ to: 'search', label: 'Search', icon: SearchCode },
	{ to: 'evaluation', label: 'Evaluation', icon: FlaskConical },
	{ to: 'settings', label: 'Settings', icon: Settings },
] as const;

/**
 * WorkspaceShell (design 3c) — the persistent per-project chrome: a
 * conversation-centric sidebar (no project list), a top bar with the project
 * breadcrumb + Mesh status, and a compact secondary nav (Chat leads). Loads the
 * active project and its conversations and provides both to nested routes.
 */
export function WorkspaceShell() {
	const { projectId } = useParams<{ projectId: string }>();
	const [params] = useSearchParams();
	const activeConversationId = params.get('c');
	const project = useAsync<Project>();
	const conversations = useAsync<Conversation[]>();

	const refreshConversations = useCallback(
		() => (projectId ? conversations.run(() => api.listChats(projectId)) : Promise.resolve()),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[projectId]
	);

	useEffect(() => {
		if (projectId) {
			void project.run(() => api.getProject(projectId));
			void refreshConversations();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectId]);

	if (project.state.status === 'pending' || project.state.status === 'idle') {
		return <div className="flex h-screen items-center justify-center bg-mc-bg text-sm text-mc-text-2">Loading project…</div>;
	}
	if (project.state.status === 'error') {
		return (
			<div className="flex h-screen items-center justify-center bg-mc-bg px-6 text-center text-sm text-mc-danger">
				Couldn't load this project — it may not exist, or you don't have access to it.
			</div>
		);
	}

	const p = project.state.value;
	const convList = conversations.state.status === 'success' ? conversations.state.value : [];

	return (
		<div className="flex h-screen overflow-hidden bg-mc-bg text-mc-text">
			<WorkspaceSidebar project={p} conversations={convList} activeId={activeConversationId} refreshConversations={refreshConversations} />

			<div className="relative flex min-w-0 flex-1 flex-col">
				{/* Top bar */}
				<header className="z-10 flex flex-none items-center gap-4 border-b border-white/[.06] bg-[rgba(8,8,11,.6)] px-5 py-2.5 backdrop-blur-[14px]">
					<div className="flex items-center gap-2 text-[12.5px] text-mc-muted-2">
						<span>Meshify</span>
						<span className="text-mc-muted">/</span>
						<span className="font-medium text-mc-text">{p.name}</span>
						<span className="ml-1 flex items-center gap-1.5 rounded-full bg-mc-success/[.09] px-2 py-0.5 font-mono text-[10px] text-mc-success">
							<StatusDot color="success" glow /> {p.status.toUpperCase()}
						</span>
					</div>
					<div className="flex-1" />
					<MeshPill>Mesh · online</MeshPill>
					<button className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[.07] text-mc-text-2" title="Notifications">
						<Bell className="h-4 w-4" />
					</button>
				</header>

				{/* Secondary nav */}
				<nav className="z-10 flex flex-none gap-1 overflow-x-auto border-b border-white/[.06] bg-[rgba(8,8,11,.4)] px-4 backdrop-blur-[8px]">
					{TABS.map((tab) => (
						<NavLink
							key={tab.to}
							to={tab.to}
							className={({ isActive }) =>
								cn(
									'flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[12.5px] font-medium text-mc-text-2 transition-colors hover:text-mc-text',
									isActive && 'border-mc-accent text-mc-text'
								)
							}
						>
							<tab.icon className="h-3.5 w-3.5" />
							{tab.label}
						</NavLink>
					))}
				</nav>

				{/* Content */}
				<div className="relative min-h-0 flex-1 overflow-y-auto">
					<Atmosphere />
					<div className="relative mx-auto max-w-7xl px-6 pb-16 pt-6">
						<Outlet context={{ project: p, projectId: p.id, conversations: convList, refreshConversations } satisfies WorkspaceContext} />
					</div>
				</div>
			</div>
		</div>
	);
}
