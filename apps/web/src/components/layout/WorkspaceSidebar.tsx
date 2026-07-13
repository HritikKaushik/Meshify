import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Plus, Search, Pin, Star, MessageSquare, ChevronLeft, FolderClosed, Share2, BrainCircuit } from 'lucide-react';
import { api } from '@/api-client';
import type { Conversation, Project } from '@/api';
import { projectColor } from '@/lib/project-color';
import { MeshLogo } from '@/components/mc/primitives';
import { cn } from '@/lib/utils';

/**
 * Conversation-centric workspace sidebar (design 3c/3d), styled after Claude /
 * Cursor / ChatGPT for long AI sessions. The project list deliberately does NOT
 * appear here — you pick a project on Project Home, then live inside its
 * conversations. Pinned/Recent are real (backed by GET …/chats + the pinned
 * flag). Folders, Shared and AI Memory have no backend yet and are shown as
 * honest disabled "Soon" affordances, never fabricated content.
 */
export function WorkspaceSidebar({
	project,
	conversations,
	activeId,
	refreshConversations,
	open = false,
}: {
	project: Project;
	conversations: Conversation[];
	activeId: string | null;
	refreshConversations: () => Promise<unknown>;
	/** Mobile drawer open state — ignored at lg+, where the sidebar is static. */
	open?: boolean;
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState('');

	const { pinned, recent } = useMemo(() => {
		const q = query.trim().toLowerCase();
		const match = (c: Conversation) => !q || (c.title ?? 'untitled').toLowerCase().includes(q);
		const filtered = conversations.filter(match);
		return { pinned: filtered.filter((c) => c.pinned), recent: filtered.filter((c) => !c.pinned) };
	}, [conversations, query]);

	const togglePin = async (c: Conversation) => {
		await api.updateChat(project.id, c.id, { pinned: !c.pinned });
		await refreshConversations();
	};

	const openConversation = (id: string) => navigate(`/projects/${project.id}/chat?c=${id}`);

	return (
		<aside
			className={cn(
				'flex h-full w-[264px] flex-none flex-col gap-1 border-r border-white/[.06] bg-[rgba(10,10,14,.92)] px-3 py-3.5 backdrop-blur-[14px]',
				// Off-canvas drawer below lg; static column at lg+.
				'fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:static lg:z-10 lg:translate-x-0 lg:bg-[rgba(10,10,14,.74)]',
				open ? 'translate-x-0' : '-translate-x-full'
			)}
		>
			{/* Workspace context */}
			<div className="flex items-center gap-2.5 px-1.5 pb-2.5">
				<MeshLogo size={26} />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-[13px] font-semibold tracking-[-.01em] text-mc-text">{project.name}</span>
					<span className="font-mono text-[9px] tracking-[.05em] text-mc-muted-2">WORKSPACE</span>
				</div>
				<span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: projectColor(project.id) }} />
			</div>

			{/* New conversation */}
			<button
				onClick={() => navigate(`/projects/${project.id}/chat`)}
				className="flex items-center justify-center gap-2 rounded-lg bg-mc-accent px-3 py-2.5 text-[13px] font-semibold text-mc-bg shadow-[0_0_18px_rgba(227,154,76,.24)] transition-colors hover:bg-mc-accent-hi"
			>
				<Plus className="h-4 w-4" /> New Conversation
			</button>

			{/* Search */}
			<div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.03] px-2.5 py-2 text-mc-muted-2">
				<Search className="h-3.5 w-3.5" />
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search conversations"
					className="w-full bg-transparent text-xs text-mc-text placeholder:text-mc-muted focus:outline-none"
				/>
			</div>

			{/* Conversation lists */}
			<div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
				{conversations.length === 0 && (
					<div className="px-2 py-6 text-center text-[12px] leading-relaxed text-mc-text-3">
						No conversations yet. Start one with <span className="text-mc-text-2">New Conversation</span>.
					</div>
				)}

				{pinned.length > 0 && <SectionLabel>PINNED</SectionLabel>}
				{pinned.map((c) => (
					<ConversationRow key={c.id} c={c} active={c.id === activeId} onOpen={openConversation} onTogglePin={togglePin} />
				))}

				{recent.length > 0 && <SectionLabel>RECENT</SectionLabel>}
				{recent.map((c) => (
					<ConversationRow key={c.id} c={c} active={c.id === activeId} onOpen={openConversation} onTogglePin={togglePin} />
				))}

				{/* Honest "not yet backed" affordances */}
				<div className="mt-2 flex flex-col gap-0.5 border-t border-white/[.05] pt-2">
					<SoonRow icon={FolderClosed} label="Folders" />
					<SoonRow icon={Share2} label="Shared with me" />
					<SoonRow icon={BrainCircuit} label="AI Memory" />
				</div>
			</div>

			{/* Footer */}
			<div className="mt-1 flex items-center gap-2.5 border-t border-white/[.06] pt-2.5">
				<UserButton afterSignOutUrl="/" />
				<Link to="/home" className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/[.06] bg-white/[.02] px-2.5 py-1.5 text-[11.5px] font-medium text-mc-text-3 transition-colors hover:text-mc-text-2">
					<ChevronLeft className="h-3.5 w-3.5" /> All projects
				</Link>
			</div>
		</aside>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <div className="px-2 pb-1 pt-3 font-mono text-[10px] tracking-[.11em] text-mc-muted-2">{children}</div>;
}

function ConversationRow({ c, active, onOpen, onTogglePin }: { c: Conversation; active: boolean; onOpen: (id: string) => void; onTogglePin: (c: Conversation) => void }) {
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(c.id)}
			onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(c.id)}
			className={cn(
				'group flex cursor-pointer flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors',
				active ? 'border border-mc-accent/20 bg-gradient-to-r from-mc-accent/[.12] to-transparent' : 'hover:bg-white/[.03]'
			)}
		>
			<div className="flex items-center gap-2">
				{c.pinned ? <Star className="h-3 w-3 flex-none fill-current text-mc-accent" /> : <MessageSquare className="h-3 w-3 flex-none text-mc-muted-2" />}
				<span className={cn('flex-1 truncate text-[12.5px]', active ? 'font-medium text-mc-text' : 'text-mc-text-2')}>{c.title ?? 'Untitled conversation'}</span>
				<button
					onClick={(e) => { e.stopPropagation(); onTogglePin(c); }}
					title={c.pinned ? 'Unpin' : 'Pin'}
					className={cn('rounded p-0.5 transition-opacity', c.pinned ? 'text-mc-accent' : 'text-mc-muted opacity-0 group-hover:opacity-100 hover:text-mc-text-2')}
				>
					<Pin className={cn('h-3 w-3', c.pinned && 'fill-current')} />
				</button>
			</div>
			<span className="pl-5 font-mono text-[10.5px] text-mc-muted">{c.messageCount} message{c.messageCount === 1 ? '' : 's'}</span>
		</div>
	);
}

function SoonRow({ icon: Icon, label }: { icon: typeof FolderClosed; label: string }) {
	return (
		<div className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-mc-muted" title="Coming soon">
			<Icon className="h-3.5 w-3.5" />
			<span className="flex-1 text-[12.5px]">{label}</span>
			<span className="rounded border border-white/[.08] px-1.5 py-0.5 font-mono text-[8.5px] tracking-wide text-mc-muted-2">SOON</span>
		</div>
	);
}
