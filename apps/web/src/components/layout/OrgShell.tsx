import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { Search, Bell } from 'lucide-react';
import { api } from '@/api-client';
import type { Project } from '@/api';
import { useAsync } from '@/ui';
import { Atmosphere } from '@/components/mc/Atmosphere';
import { MeshLogo } from '@/components/mc/primitives';
import { CommandPalette } from '@/components/common/CommandPalette';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export interface OrgContext {
	projects: Project[];
	loading: boolean;
	refreshProjects: () => Promise<unknown>;
	openCreate: () => void;
}

/** Access org-level data provided by OrgShell (Project Home / 3b). */
export function useOrg(): OrgContext {
	return useOutletContext<OrgContext>();
}

/**
 * OrgShell (design 3b) — the chrome for Project Home. A top bar (logo, org,
 * ⌘K search, New Project, notifications, user) over the atmosphere backdrop,
 * with NO project-list sidebar (projects are chosen here, not persistently
 * nav'd). Owns the org project list, the create-project flow, and the global
 * command palette; hands them to the page via outlet context.
 */
export function OrgShell() {
	const navigate = useNavigate();
	const location = useLocation();
	const projects = useAsync<Project[]>();
	const create = useAsync<Project>();
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');

	const refreshProjects = useCallback(() => projects.run(() => api.listProjects()), [projects]);

	useEffect(() => {
		void refreshProjects();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Global ⌘K / Ctrl-K opens the command palette.
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

	const list = projects.state.status === 'success' ? projects.state.value : [];

	const handleCreate = async () => {
		const project = await create.run(() => api.createProject({ name, description: description || undefined }));
		if (project) {
			setCreateOpen(false);
			setName('');
			setDescription('');
			toast.success(`Created "${project.name}"`);
			void refreshProjects();
			navigate(`/projects/${project.id}`);
		}
	};

	return (
		<div className="relative flex min-h-screen flex-col bg-mc-bg text-mc-text">
			<Atmosphere />
			{/* Top bar */}
			<header className="relative z-10 flex flex-none items-center gap-3 border-b border-black/[.06] bg-white/85 px-4 py-2.5 backdrop-blur-[14px] sm:gap-4 sm:px-6">
				<Link to="/home" className="flex items-center gap-2.5">
					<MeshLogo size={27} />
					<span className="hidden text-[15px] font-semibold tracking-[-.01em] sm:inline">Meshify</span>
				</Link>
				<div className="h-5 w-px bg-black/10" />
				<button
					onClick={() => setPaletteOpen(true)}
					className="flex flex-1 items-center gap-2.5 rounded-xl border border-black/[.08] bg-white px-3 py-2 text-mc-muted-2 shadow-[0_1px_3px_rgba(16,24,40,.04)] transition-colors hover:border-black/15 sm:max-w-md"
				>
					<Search className="h-3.5 w-3.5" />
					<span className="flex-1 truncate text-left text-[12.5px]">Search projects, repos, conversations…</span>
					<kbd className="hidden rounded border border-black/[.12] px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
				</button>
				<div className="flex-1" />
				<button className="relative hidden h-8 w-8 items-center justify-center rounded-lg border border-black/[.07] bg-white text-mc-text-3 shadow-[0_1px_3px_rgba(16,24,40,.04)] sm:flex" title="Notifications">
					<Bell className="h-4 w-4" />
					<span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border-[1.5px] border-white bg-mc-danger" />
				</button>
				<UserButton afterSignOutUrl="/" />
			</header>

			{/* Content */}
			<div key={location.pathname} className="relative z-[1] mx-auto w-full max-w-7xl flex-1 animate-fade px-4 py-6 sm:px-8">
				<Outlet
					context={
						{
							projects: list,
							loading: projects.state.status === 'pending' || projects.state.status === 'idle',
							refreshProjects,
							openCreate: () => setCreateOpen(true),
						} satisfies OrgContext
					}
				/>
			</div>

			<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} projects={list} onNewProject={() => setCreateOpen(true)} />

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="border-black/[.08] bg-white">
					<DialogHeader>
						<DialogTitle>Create a project</DialogTitle>
						<DialogDescription>Provisions its own isolated Qdrant collections and RocketRide pipelines.</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
						<Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
					</div>
					{create.state.status === 'error' && <p className="text-sm text-mc-danger">{(create.state.error as Error).message}</p>}
					<DialogFooter>
						<Button variant="mesh" onClick={handleCreate} disabled={!name.trim() || create.state.status === 'pending'}>
							{create.state.status === 'pending' ? 'Creating…' : 'Create'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
