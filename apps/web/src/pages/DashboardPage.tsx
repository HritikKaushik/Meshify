import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowUpRight } from 'lucide-react';
import { api } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import type { Project } from '@/api';
import { useAsync } from '@/ui';
import { projectColor } from '@/lib/project-color';
import { StatusDot, Kicker } from '@/components/mc/primitives';
import { cn } from '@/lib/utils';

interface ShellContext {
	refreshProjects: () => Promise<unknown>;
}

export function DashboardPage() {
	const navigate = useNavigate();
	const { refreshProjects } = useOutletContext<ShellContext>();
	const list = useAsync<Project[]>();
	const create = useAsync<Project>();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');

	const refresh = () => list.run(() => api.listProjects());

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleCreate = async () => {
		const project = await create.run(() => api.createProject({ name, description: description || undefined }));
		if (project) {
			setOpen(false);
			setName('');
			setDescription('');
			toast.success(`Created "${project.name}"`);
			void refresh();
			void refreshProjects();
			navigate(`/projects/${project.id}`);
		}
	};

	const projects = list.state.status === 'success' ? list.state.value : [];

	return (
		<div>
			<div className="mb-6 flex items-end justify-between">
				<div className="flex flex-col gap-1.5">
					<Kicker>// WORKSPACE</Kicker>
					<h1 className="text-2xl font-semibold tracking-tight text-mc-text">Projects</h1>
					<p className="text-sm text-mc-text-3">Each project owns an isolated, RAG-queryable knowledge base over its documents and code.</p>
				</div>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<button className="flex items-center gap-2 rounded-lg bg-mc-accent px-4 py-2.5 text-[13px] font-semibold text-mc-bg shadow-[0_0_20px_rgba(227,154,76,.3)] transition-colors hover:bg-mc-accent-hi">
							<Plus className="h-4 w-4" /> New project
						</button>
					</DialogTrigger>
					<DialogContent className="border-white/[.08] bg-mc-card">
						<DialogHeader>
							<DialogTitle>Create a project</DialogTitle>
							<DialogDescription>Provisions its own isolated Qdrant collections and RocketRide pipelines.</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-3">
							<Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
							<Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
						</div>
						<DialogFooter>
							<Button onClick={handleCreate} disabled={!name.trim() || create.state.status === 'pending'}>
								{create.state.status === 'pending' ? 'Creating…' : 'Create'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{list.state.status === 'pending' && <p className="text-sm text-mc-text-3">Loading projects…</p>}
			{list.state.status === 'error' && <p className="text-sm text-mc-danger">Couldn't load projects — {(list.state.error as Error).message}</p>}
			{list.state.status === 'success' && projects.length === 0 && (
				<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[.1] py-16 text-center">
					<p className="text-sm text-mc-text-3">No projects yet.</p>
					<button onClick={() => setOpen(true)} className="text-sm text-mc-accent hover:text-mc-accent-hi">
						Create your first project →
					</button>
				</div>
			)}

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{projects.map((p) => (
					<button
						key={p.id}
						onClick={() => navigate(`/projects/${p.id}`)}
						className={cn(
							'group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-white/[.06] bg-[rgba(18,18,24,.55)] p-5 text-left backdrop-blur-[10px] transition-all hover:border-mc-accent/40'
						)}
					>
						<div
							className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
							style={{ background: projectColor(p.id) }}
						/>
						<div className="relative flex items-center gap-2.5">
							<span className="h-4 w-4 rounded-md" style={{ background: projectColor(p.id) }} />
							<span className="flex-1 truncate text-[15px] font-semibold text-mc-text">{p.name}</span>
							<StatusDot color={p.status === 'active' ? 'success' : 'muted'} glow={p.status === 'active'} />
						</div>
						<p className="relative min-h-[2.5rem] text-xs leading-relaxed text-mc-text-3">
							{p.description || 'No description.'}
						</p>
						<div className="relative flex items-center justify-between font-mono text-[11px] text-mc-muted">
							<span className="truncate">{p.llmProfile}</span>
							<span className="flex items-center gap-1 text-mc-text-2 opacity-0 transition-opacity group-hover:opacity-100">
								Open <ArrowUpRight className="h-3 w-3" />
							</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
