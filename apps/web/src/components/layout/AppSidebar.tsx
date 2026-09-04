import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import {
	MessageSquare,
	FolderGit2,
	FileText,
	MessagesSquare,
	Blocks,
	Settings,
	Plus,
	Star,
	Pin,
	Trash2,
	ChevronsUpDown,
	LayoutGrid,
	type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api-client';
import type { Conversation, Project } from '@/api';
import { projectColor } from '@/lib/project-color';
import { MeshLogo } from '@/components/mc/primitives';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Section = { to: string; label: string; icon: LucideIcon };
export const SECTIONS: Section[] = [
	{ to: 'chat', label: 'Chat', icon: MessageSquare },
	{ to: 'repository', label: 'Repositories', icon: FolderGit2 },
	{ to: 'documents', label: 'Documents', icon: FileText },
	{ to: 'slack', label: 'Slack', icon: MessagesSquare },
	{ to: 'integrations', label: 'Integrations', icon: Blocks },
];
export const SECTION_LABEL: Record<string, string> = {
	...Object.fromEntries(SECTIONS.map((s) => [s.to, s.label])),
	settings: 'Settings',
};

/**
 * The Meshify workspace sidebar, built on the shadcn Sidebar primitive
 * (collapsible to icons). Header = project switcher (opens ⌘K); content = the
 * section nav plus, on Chat, the conversation list; footer = All-projects + user.
 * All data-loading + conversation actions (pin/delete) are preserved.
 */
export function AppSidebar({
	project,
	conversations,
	activeId,
	refreshConversations,
	onOpenPalette,
}: {
	project: Project;
	conversations: Conversation[];
	activeId: string | null;
	refreshConversations: () => Promise<unknown>;
	onOpenPalette: () => void;
}) {
	const navigate = useNavigate();
	const location = useLocation();
	const currentTab = location.pathname.split('/').filter(Boolean).pop() ?? 'chat';
	const isChat = currentTab === 'chat';
	const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
	const [deleting, setDeleting] = useState(false);

	const { pinned, recent } = useMemo(() => {
		return { pinned: conversations.filter((c) => c.pinned), recent: conversations.filter((c) => !c.pinned).slice(0, 14) };
	}, [conversations]);

	const togglePin = async (c: Conversation) => {
		await api.updateChat(project.id, c.id, { pinned: !c.pinned });
		await refreshConversations();
	};

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		setDeleting(true);
		try {
			await api.deleteChat(project.id, pendingDelete.id);
			toast.success('Conversation deleted');
			if (activeId === pendingDelete.id) void navigate(`/projects/${project.id}/chat`, { replace: true });
			setPendingDelete(null);
			await refreshConversations();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							onClick={onOpenPalette}
							tooltip={project.name}
							className="data-[state=open]:bg-sidebar-accent"
						>
							<div className="flex aspect-square size-8 items-center justify-center">
								<MeshLogo size={30} />
							</div>
							<div className="flex min-w-0 flex-1 flex-col text-left leading-tight">
								<span className="truncate text-sm2 font-semibold text-sidebar-foreground">{project.name}</span>
								<span className="flex items-center gap-1.5 truncate font-mono text-[9px] tracking-[.06em] text-mc-muted-2">
									<span className="h-2 w-2 rounded-sm" style={{ background: projectColor(project.id) }} /> WORKSPACE
								</span>
							</div>
							<ChevronsUpDown className="ml-auto size-4 text-mc-muted-2" />
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{/* Section nav */}
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{SECTIONS.map((s) => (
								<SidebarMenuItem key={s.to}>
									<SidebarMenuButton asChild isActive={currentTab === s.to} tooltip={s.label}>
										<Link to={`/projects/${project.id}/${s.to}`}>
											<s.icon />
											<span>{s.label}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{/* Conversations (Chat only) */}
				{isChat && (
					<SidebarGroup className="group-data-[collapsible=icon]:hidden">
						<SidebarGroupLabel>Conversations</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton onClick={() => navigate(`/projects/${project.id}/chat`)} className="text-mc-accent-lo">
										<Plus />
										<span>New Conversation</span>
									</SidebarMenuButton>
								</SidebarMenuItem>

								{conversations.length === 0 && (
									<div className="px-2 py-3 text-caption leading-relaxed text-mc-muted">No conversations yet.</div>
								)}

								{[...pinned, ...recent].map((c) => (
									<SidebarMenuItem key={c.id}>
										<SidebarMenuButton asChild isActive={c.id === activeId} className="pr-14">
											<Link to={`/projects/${project.id}/chat?c=${c.id}`}>
												{c.pinned ? <Star className="fill-current text-mc-accent" /> : <MessageSquare />}
												<span className="truncate">{c.title ?? 'Untitled conversation'}</span>
											</Link>
										</SidebarMenuButton>
										<SidebarMenuAction
											className="right-7 text-mc-muted hover:text-mc-text"
											onClick={() => togglePin(c)}
											title={c.pinned ? 'Unpin' : 'Pin'}
											showOnHover={!c.pinned}
										>
											<Pin className={cn('size-3.5', c.pinned && 'fill-current text-mc-accent')} />
										</SidebarMenuAction>
										<SidebarMenuAction className="hover:text-mc-danger" onClick={() => setPendingDelete(c)} title="Delete conversation" showOnHover>
											<Trash2 className="size-3.5" />
										</SidebarMenuAction>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild isActive={currentTab === 'settings'} tooltip="Settings">
							<Link to={`/projects/${project.id}/settings`}>
								<Settings />
								<span>Settings</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="All projects">
							<Link to="/home">
								<LayoutGrid />
								<span>All projects</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<div className="flex items-center gap-2 px-1.5 py-1">
							<UserButton afterSignOutUrl="/" />
							<span className="flex-1 truncate text-caption text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">Account</span>
							<ThemeToggle className="group-data-[collapsible=icon]:hidden" />
						</div>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />

			<Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete this conversation?</DialogTitle>
						<DialogDescription>
							“{pendingDelete?.title ?? 'Untitled conversation'}” and all of its messages will be permanently removed. This can't be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="glass" onClick={() => setPendingDelete(null)} disabled={deleting}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
							{deleting ? 'Deleting…' : 'Delete conversation'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Sidebar>
	);
}
