import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bell, Command as CommandIcon } from 'lucide-react';
import { useOrganization } from '@clerk/clerk-react';
import { api } from '@/api-client';
import type { Conversation, Project } from '@/api';
import { useAsync, EMPTY } from '@/ui';
import { Atmosphere } from '@/components/mc/Atmosphere';
import { StatusDot } from '@/components/mc/primitives';
import { AppSidebar, SECTION_LABEL } from '@/components/layout/AppSidebar';
import { CommandPalette } from '@/components/common/CommandPalette';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { JobsProvider } from '@/components/jobs/JobsProvider';
import { JobProgressCenter } from '@/components/jobs/JobProgressCenter';
import type { WorkspaceContext } from '@/lib/workspace-context';
import { cn } from '@/lib/utils';

/**
 * WorkspaceShell — the per-project chrome, built on the shadcn Sidebar system.
 * A collapsible AppSidebar (icon-collapsible, mobile sheet, ⌘B) sits beside a
 * SidebarInset whose header carries the trigger, a breadcrumb, and status/⌘K/
 * theme controls. Loads the active project + its conversations and provides both
 * to nested routes. All routing + data behavior is preserved.
 */
export function WorkspaceShell() {
	const { projectId } = useParams<{ projectId: string }>();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const location = useLocation();
	const activeConversationId = params.get('c');
	const [paletteOpen, setPaletteOpen] = useState(false);
	const { organization } = useOrganization();
	const project = useAsync<Project>();
	const conversations = useAsync<Conversation[]>();
	const allProjects = useAsync<Project[]>();

	// Global ⌘K palette (project switcher).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				setPaletteOpen((v) => !v);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	const refreshConversations = useCallback(
		() => (projectId ? conversations.run(() => api.listChats(projectId)) : Promise.resolve()),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[projectId]
	);

	useEffect(() => {
		if (projectId) {
			void project.run(() => api.getProject(projectId));
			void refreshConversations();
			void allProjects.run(() => api.listProjects());
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
	const convList = conversations.data ?? EMPTY;
	const projectList = allProjects.data ?? EMPTY;
	const currentTab = location.pathname.split('/').filter(Boolean).pop() ?? 'chat';
	const isChat = currentTab === 'chat';
	const orgName = organization?.name ?? 'Workspace';
	const workspaceContext = { project: p, projectId: p.id, conversations: convList, refreshConversations } satisfies WorkspaceContext;

	return (
		<JobsProvider projectId={p.id}>
			<SidebarProvider className="h-svh overflow-hidden">
				<AppSidebar
					project={p}
					conversations={convList}
					activeId={activeConversationId}
					refreshConversations={refreshConversations}
					onOpenPalette={() => setPaletteOpen(true)}
				/>
				<SidebarInset className="flex min-h-0 flex-col overflow-hidden bg-mc-bg">
					{/* Top bar — trigger + breadcrumb + status + ⌘K + theme */}
					<header className="z-10 flex h-14 flex-none items-center gap-2 border-b border-mc-hairline bg-mc-card/70 px-3 backdrop-blur-xl sm:px-4">
						<SidebarTrigger className="-ml-1 text-mc-text-3 hover:text-mc-text" />
						<Separator orientation="vertical" className="mr-1 h-4" />
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem className="hidden md:block">
									<BreadcrumbLink onClick={() => navigate('/home')} className="cursor-pointer">
										{orgName}
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden md:block" />
								<BreadcrumbItem className="hidden sm:block">
									<BreadcrumbLink onClick={() => setPaletteOpen(true)} className="cursor-pointer">
										{p.name}
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden sm:block" />
								<BreadcrumbItem>
									<BreadcrumbPage>{SECTION_LABEL[currentTab] ?? 'Chat'}</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						<div className="flex-1" />

						<span className="hidden items-center gap-1.5 rounded-full bg-mc-success/[.12] px-2.5 py-1 font-mono text-micro text-mc-success-lo md:flex">
							<StatusDot color="success" glow /> {p.status === 'active' ? 'ALL SYSTEMS NOMINAL' : p.status.toUpperCase()}
						</span>
						<button
							onClick={() => setPaletteOpen(true)}
							className="flex h-8 items-center gap-2 rounded-lg border border-mc-border bg-mc-card px-2.5 text-mc-text-3 transition-colors hover:text-mc-text"
							title="Command palette"
						>
							<CommandIcon className="h-3.5 w-3.5" />
							<kbd className="hidden font-mono text-micro text-mc-muted-2 sm:inline">⌘K</kbd>
						</button>
						<button
							className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-mc-border bg-mc-card text-mc-text-3 transition-colors hover:text-mc-text"
							title="Notifications"
						>
							<Bell className="h-4 w-4" />
						</button>
						<ThemeToggle />
					</header>

					{/* Content — Chat fills the area; other tabs use a padded reading container. */}
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
				</SidebarInset>
			</SidebarProvider>

			<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} projects={projectList} onNewProject={() => navigate('/home')} />
			<JobProgressCenter />
		</JobsProvider>
	);
}
