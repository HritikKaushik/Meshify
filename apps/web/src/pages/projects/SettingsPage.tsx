import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/api-client';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { GlassCard, Kicker } from '@/components/mc/primitives';
import { DataRow } from '@/components/common/DataRow';
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
		void navigate('/home');
	};

	return (
		<div className="flex max-w-2xl flex-col gap-5">
			<GlassCard className="flex flex-col gap-4 p-5">
				<Kicker>// CONFIGURATION</Kicker>
				<DataRow label="Name" value={project.name} divider />
				<DataRow label="Description" value={project.description || '—'} divider />
				<DataRow label="Project ID" value={project.id} mono divider />
				<DataRow label="Status" value={project.status} divider />
				<DataRow label="LLM profile" value={project.llmProfile} mono divider />
				<DataRow label="Embedding profile" value={project.embeddingProfile} mono divider />
				<DataRow label="Created" value={new Date(project.createdAt).toLocaleString()} divider />
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
					<DialogContent className="border-mc-border bg-mc-card">
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
							className="h-9 rounded-lg border border-mc-border bg-mc-surface px-3 text-sm text-mc-text placeholder:text-mc-muted focus:outline-none focus:ring-1 focus:ring-mc-danger/50"
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

