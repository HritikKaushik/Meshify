import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Bell, Menu, LayoutDashboard, SearchCode, FlaskConical, Settings, MoreHorizontal } from 'lucide-react';
import { useOrganization, UserButton } from '@clerk/clerk-react';
import { api } from '@/api-client';
import type { Conversation, Project } from '@/api';
import { usePersistent } from '@/store';
import { useAsync } from '@/ui';
import { Atmosphere } from '@/components/mc/Atmosphere';
import { StatusDot } from '@/components/mc/primitives';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import type { WorkspaceContext } from '@/lib/workspace-context';
import { cn } from '@/lib/utils';

// The three primary tabs shown as an in-header segmented control (design 4c/4d/4e).
const PRIMARY_TABS = [
	{ to: 'chat', label: 'Chat' },
	{ to: 'repository', label: 'Repository' },
	{ to: 'documents', label: 'Documents' },
] as const;

// Everything else stays one click away in a "More" menu off the tab bar.
const MORE_TABS = [
	{ to: 'overview', label: 'Overview', icon: LayoutDashboard },
	{ to: 'search', label: 'Search', icon: SearchCode },
	{ to: 'evaluation', label: 'Evaluation', icon: FlaskConical },
	{ to: 'settings', label: 'Settings', icon: Settings },
] as const;

/**
 * WorkspaceShell (design 4c) — the persistent per-project chrome: a
 * conversation-centric sidebar and a single top bar carrying the org/project
 * breadcrumb, a segmented Chat · Repository · Documents tab control (+ a "More"
 * menu for the secondary routes), and system status. Loads the active project
 * and its conversations and provides both to nested routes.
 */
export function WorkspaceShell() {
	const { projectId } = useParams<{ projectId: string }>();
	const [params] = useSearchParams();
	const location = useLocation();
	const activeConversationId = params.get('c');
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [moreOpen, setMoreOpen] = useState(false);
	const [collapsed, setCollapsed] = usePersistent<boolean>('meshify.sidebarCollapsed', false);
	const { organization } = useOrganization();
	const project = useAsync<Project>();
	const conversations = useAsync<Conversation[]>();

	// Close the mobile drawer + More menu whenever the route (tab or conversation) changes.
	useEffect(() => {
		setSidebarOpen(false);
		setMoreOpen(false);
	}, [location.pathname, location.search]);

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
		return <div className="flex h-screen items-center justify-center bg-mc-bg text-sm text-mc-text-3">Loading project…</div>;
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
	const currentTab = location.pathname.split('/').filter(Boolean).pop() ?? 'chat';
	const isChat = currentTab === 'chat';
	const moreActive = MORE_TABS.some((t) => t.to === currentTab);
	const orgName = organization?.name ?? 'Workspace';
	const workspaceContext = { project: p, projectId: p.id, conversations: convList, refreshConversations } satisfies WorkspaceContext;

	return (
		<div className="flex h-screen overflow-hidden bg-mc-bg text-mc-text">
			<WorkspaceSidebar
				project={p}
				conversations={convList}
				activeId={activeConversationId}
				refreshConversations={refreshConversations}
				open={sidebarOpen}
				collapsed={collapsed}
				onToggleCollapse={() => setCollapsed(!collapsed)}
			/>

			{/* Mobile drawer backdrop */}
			{sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

			<div className="relative flex min-w-0 flex-1 flex-col">
				{/* Top bar — breadcrumb + segmented tab control + status (design 4c) */}
				<header className="z-10 flex h-[58px] flex-none items-center gap-3 border-b border-black/[.06] bg-white/85 px-4 backdrop-blur-[14px] sm:gap-3.5 sm:px-5">
					<button
						onClick={() => setSidebarOpen(true)}
						className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-black/[.08] bg-white text-mc-text-3 lg:hidden"
						title="Conversations"
					>
						<Menu className="h-4 w-4" />
					</button>

					{/* Breadcrumb: org / project */}
					<div className="hidden min-w-0 items-center gap-2 text-[12.5px] text-mc-muted sm:flex">
						<span className="truncate">{orgName}</span>
						<span className="text-[#C4C9D4]">/</span>
						<span className="flex items-center gap-1.5 truncate rounded-lg border border-black/[.08] bg-white px-2.5 py-1 font-medium text-mc-text shadow-[0_1px_2px_rgba(16,24,40,.04)]">
							{p.name} <span className="text-mc-muted-2">▾</span>
						</span>
					</div>

					{/* Segmented tab control */}
					<nav className="flex items-center gap-1 overflow-x-auto rounded-xl bg-mc-raised p-[3px]">
						{PRIMARY_TABS.map((tab) => (
							<NavLink
								key={tab.to}
								to={tab.to}
								className={({ isActive }) =>
									cn(
										'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
										isActive ? 'bg-white text-mc-accent-lo shadow-[0_1px_3px_rgba(16,24,40,.08)]' : 'text-mc-text-3 hover:text-mc-text'
									)
								}
							>
								{tab.label}
							</NavLink>
						))}

						{/* More menu — the secondary routes */}
						<div className="relative">
							<button
								onClick={() => setMoreOpen((v) => !v)}
								title="More"
								className={cn(
									'flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
									moreActive ? 'bg-white text-mc-accent-lo shadow-[0_1px_3px_rgba(16,24,40,.08)]' : 'text-mc-text-3 hover:text-mc-text'
								)}
							>
								<MoreHorizontal className="h-4 w-4" />
								<span className="hidden sm:inline">More</span>
							</button>
							{moreOpen && (
								<>
									<div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
									<div className="absolute left-0 top-[calc(100%+8px)] z-40 flex w-44 flex-col gap-0.5 rounded-xl border border-black/[.08] bg-white p-1.5 shadow-[0_16px_40px_rgba(16,24,40,.16)]">
										{MORE_TABS.map((tab) => (
											<NavLink
												key={tab.to}
												to={tab.to}
												className={({ isActive }) =>
													cn(
														'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors',
														isActive ? 'bg-mc-accent/[.08] text-mc-accent-lo' : 'text-mc-text-3 hover:bg-mc-surface hover:text-mc-text'
													)
												}
											>
												<tab.icon className="h-3.5 w-3.5" />
												{tab.label}
											</NavLink>
										))}
									</div>
								</>
							)}
						</div>
					</nav>

					<div className="flex-1" />

					{/* System status */}
					<span className="hidden items-center gap-1.5 rounded-full bg-mc-success/[.09] px-2.5 py-1 font-mono text-[10px] text-mc-success md:flex">
						<StatusDot color="success" glow /> {p.status === 'active' ? 'ALL SYSTEMS NOMINAL' : p.status.toUpperCase()}
					</span>
					<button className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-black/[.07] bg-white text-mc-text-3" title="Notifications">
						<Bell className="h-4 w-4" />
					</button>
					<UserButton afterSignOutUrl="/" />
				</header>

				{/* Content — Chat fills the whole main area (design 4c); other tabs
				    live in the calm, padded reading container. */}
				<div className={cn('relative min-h-0 flex-1', isChat ? 'overflow-hidden' : 'overflow-y-auto')}>
					<Atmosphere />
					{isChat ? (
						<div key={location.pathname} className="relative flex h-full animate-fade flex-col">
							<Outlet context={workspaceContext} />
						</div>
					) : (
						<div key={location.pathname} className="relative mx-auto max-w-7xl animate-fade px-4 pb-16 pt-6 sm:px-6">
							<Outlet context={workspaceContext} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
