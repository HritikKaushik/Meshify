import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/api-client';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { GlassCard, Kicker } from '@/components/mc/primitives';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

/**
 * Project Settings (secondary nav, design 3c). Surfaces the project's real
 * configuration (LLM/embedding profiles, status, identifiers) read from the
 * project record, plus a guarded delete. Backed entirely by existing APIs
 * (getProject via the shell, deleteProject) — no fabricated settings.
 */
export function SettingsPage() {
	const { project } = useWorkspace();
	const navigate = useNavigate();
	const del = useAsync<void>();
	const [confirm, setConfirm] = useState('');

	const doDelete = async () => {
		await del.run(() => api.deleteProject(project.id));
		toast.success(`Deleted "${project.name}"`);
		navigate('/home');
	};

	return (
		<div className="flex max-w-2xl flex-col gap-5">
			<GlassCard className="flex flex-col gap-4 p-5">
				<Kicker>// CONFIGURATION</Kicker>
				<Row label="Name" value={project.name} />
				<Row label="Description" value={project.description || '—'} />
				<Row label="Project ID" value={project.id} mono />
				<Row label="Status" value={project.status} />
				<Row label="LLM profile" value={project.llmProfile} mono />
				<Row label="Embedding profile" value={project.embeddingProfile} mono />
				<Row label="Created" value={new Date(project.createdAt).toLocaleString()} />
			</GlassCard>

			<div className="flex flex-col gap-3 rounded-xl border border-mc-danger/30 bg-mc-danger/[.05] p-5">
				<div className="flex flex-col gap-1">
					<span className="text-sm font-semibold text-mc-danger">Danger zone</span>
					<span className="text-xs text-mc-text-3">
						Deleting a project removes its documents, repositories and indexed knowledge. This cannot be undone.
					</span>
				</div>
				<Dialog onOpenChange={() => setConfirm('')}>
					<DialogTrigger asChild>
						<Button variant="destructive" size="sm" className="w-fit gap-2">
							<Trash2 className="h-3.5 w-3.5" /> Delete project
						</Button>
					</DialogTrigger>
					<DialogContent className="border-white/[.08] bg-mc-card">
						<DialogHeader>
							<DialogTitle>Delete “{project.name}”?</DialogTitle>
							<DialogDescription>
								Type the project name to confirm. This permanently removes all of its indexed knowledge.
							</DialogDescription>
						</DialogHeader>
						<input
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder={project.name}
							className="h-9 rounded-lg border border-white/[.09] bg-mc-surface px-3 text-sm text-mc-text placeholder:text-mc-muted focus:outline-none focus:ring-1 focus:ring-mc-danger/50"
						/>
						{del.state.status === 'error' && <p className="text-sm text-mc-danger">{(del.state.error as Error).message}</p>}
						<DialogFooter>
							<Button
								variant="destructive"
								onClick={doDelete}
								disabled={confirm !== project.name || del.state.status === 'pending'}
							>
								{del.state.status === 'pending' ? 'Deleting…' : 'Delete permanently'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-4 border-b border-white/[.04] pb-3 last:border-0 last:pb-0">
			<span className="text-xs text-mc-text-3">{label}</span>
			<span className={`truncate text-right text-[13px] text-mc-text ${mono ? 'font-mono' : ''}`}>{value}</span>
		</div>
	);
}
