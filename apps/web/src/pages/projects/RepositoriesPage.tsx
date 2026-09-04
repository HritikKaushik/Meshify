import { useEffect, useMemo, useState } from 'react';
import { FolderGit2, Link2, RefreshCw, Sparkles, GitBranch, TriangleAlert, Trash2, Search, Lock, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { api } from '@/api-client';
import type { Repository, Integration, IntegrationResource } from '@/api';
import { useAsync, EMPTY } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { useRefreshOnJobComplete } from '@/components/jobs/JobsProvider';
import { GlassCard, BeamCard, MeshAvatar, Kicker } from '@/components/mc/primitives';
import { DataRow } from '@/components/common/DataRow';
import { RepoStatusBadge } from '@/components/common/RepoStatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { repoStatus } from '@/lib/repo-status';
import { cn } from '@/lib/utils';

/**
 * Repository Explorer (design 2c), adapted to real functionality. The design's
 * per-file AI summaries + folder intelligence require a file-level index the
 * backend doesn't expose yet, so this focuses on what's real: connecting a
 * GitHub repository and driving/observing its sync state, in the flight-deck
 * aesthetic. The right rail explains the actual ingestion flow rather than
 * inventing per-folder insights.
 */
export function RepositoriesPage() {
	const { project } = useWorkspace();
	const [remoteUrl, setRemoteUrl] = useState('');
	const [manualMode, setManualMode] = useState(false);
	const [search, setSearch] = useState('');
	const [pickerOpen, setPickerOpen] = useState(false);
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [attaching, setAttaching] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const list = useAsync<Repository[]>();
	const connect = useAsync<unknown>();
	const sync = useAsync<unknown>();
	const integrations = useAsync<Integration[]>();
	const resources = useAsync<{ resources: IntegrationResource[]; nextCursor?: string }>();
	const [pendingDelete, setPendingDelete] = useState<Repository | null>(null);
	const [deleting, setDeleting] = useState(false);

	const refresh = () => list.run(() => api.listRepositories(project.id));

	useEffect(() => {
		void refresh();
		void integrations.run(() => api.listIntegrations());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project.id]);

	// The org's active GitHub app grant, if any — enables browsing its repositories instead of pasting URLs.
	const githubIntegration = useMemo(
		() => integrations.data?.find((i) => i.provider === 'github' && i.status === 'active'),
		[integrations.data]
	);

	const loadResources = () => {
		if (githubIntegration) void resources.run(() => api.listIntegrationResources(githubIntegration.id));
	};
	useEffect(() => {
		loadResources();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [githubIntegration?.id]);

	// Real-time: refresh sync status when a repo ingest/sync job finishes (live progress in the Job Progress Center).
	useRefreshOnJobComplete(['clone_repo', 'sync_repo'], refresh);

	const repos = list.data ?? EMPTY;
	const selected = repos.find((r) => r.id === selectedId) ?? repos[0];

	const browsable = resources.data?.resources ?? EMPTY;
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		const matches = q ? browsable.filter((r) => r.name.toLowerCase().includes(q)) : browsable;
		return [...matches].sort((a, b) => Number(a.connected) - Number(b.connected) || a.name.localeCompare(b.name)).slice(0, 60);
	}, [browsable, search]);

	const doConnect = async () => {
		if (!remoteUrl.trim()) return;
		await connect.run(() => api.connectGitHub(project.id, remoteUrl));
		setRemoteUrl('');
		await refresh();
	};

	const togglePick = (id: string) =>
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const connectPicked = async () => {
		if (!githubIntegration || picked.size === 0) return;
		setAttaching(true);
		let done = 0;
		try {
			for (const id of picked) {
				await api.connectRepoFromIntegration(project.id, githubIntegration.id, id);
				done += 1;
			}
			toast.success(`${done} repositor${done === 1 ? 'y' : 'ies'} connected — ingestion started`);
			setPicked(new Set());
			setSearch('');
			setPickerOpen(false);
			await refresh();
			loadResources();
		} catch (err) {
			toast.error((err as Error).message);
			if (done > 0) {
				await refresh();
				loadResources();
			}
		} finally {
			setAttaching(false);
		}
	};

	const doSync = async (id: string) => {
		await sync.run(() => api.syncRepository(project.id, id));
		await refresh();
	};

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		setDeleting(true);
		try {
			await api.deleteRepository(project.id, pendingDelete.id);
			toast.success('Repository disconnected');
			if (selectedId === pendingDelete.id) setSelectedId(null);
			setPendingDelete(null);
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className="flex flex-col gap-5">
			{/* Connect: multi-select repositories from the connected GitHub app, or paste a URL. */}
			{githubIntegration && !manualMode ? (
				<div className="relative">
					<GlassCard className="flex flex-wrap items-center gap-3 p-4">
						<FolderGit2 className="h-4 w-4 flex-none text-mc-text-2" />
						<button
							onClick={() => setPickerOpen((o) => !o)}
							className="flex h-9 flex-1 items-center justify-between gap-2 rounded-lg border border-mc-border bg-mc-surface px-3 text-left text-sm text-mc-text-2 hover:bg-mc-raised"
						>
							<span className="truncate">
								{picked.size > 0 ? `${picked.size} repositor${picked.size === 1 ? 'y' : 'ies'} selected` : `Select repositories from ${githubIntegration.externalAccountName ?? 'your GitHub app'}`}
							</span>
							<ChevronDown className={cn('h-4 w-4 flex-none text-mc-text-3 transition-transform', pickerOpen && 'rotate-180')} />
						</button>
						<button
							onClick={() => void connectPicked()}
							disabled={picked.size === 0 || attaching}
							className="flex items-center gap-2 rounded-full bg-mc-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-glow-accent transition-colors hover:bg-mc-accent-hi disabled:opacity-50"
						>
							{attaching ? 'Connecting…' : `Connect${picked.size ? ` ${picked.size}` : ''}`}
						</button>
						<button onClick={() => setManualMode(true)} className="text-[11.5px] text-mc-text-3 hover:text-mc-text">
							Paste a URL
						</button>
					</GlassCard>

					{pickerOpen && (
						<>
							{/* click-outside backdrop */}
							<div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
							<GlassCard className="absolute left-0 right-0 top-full z-20 mt-1.5 flex flex-col gap-0 overflow-hidden p-0 shadow-e3">
								<div className="flex items-center gap-2.5 border-b border-mc-hairline px-3.5 py-2.5">
									<Search className="h-4 w-4 flex-none text-mc-text-2" />
									<input
										autoFocus
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										placeholder="Search repositories…"
										className="h-6 flex-1 bg-transparent text-sm text-mc-text placeholder:text-mc-muted focus:outline-none"
									/>
									<button onClick={loadResources} title="Refresh list" className="text-mc-text-3 hover:text-mc-text">
										<RefreshCw className="h-3.5 w-3.5" />
									</button>
								</div>
								<div className="max-h-[300px] overflow-y-auto py-1">
									{resources.state.status === 'pending' && <div className="px-4 py-4 text-sm text-mc-text-3">Loading repositories from GitHub…</div>}
									{resources.state.status === 'error' && <div className="px-4 py-4 text-sm text-mc-danger">{(resources.state.error as Error).message}</div>}
									{resources.state.status === 'success' && filtered.length === 0 && (
										<div className="px-4 py-6 text-center text-[13px] text-mc-text-3">
											{browsable.length === 0 ? 'This installation exposes no repositories. Grant repos to the app on GitHub, then refresh.' : 'No repositories match your search.'}
										</div>
									)}
									{filtered.map((repo) => {
										const checked = repo.connected || picked.has(repo.id);
										return (
											<label
												key={repo.id}
												className={cn(
													'flex cursor-pointer items-center gap-3 px-3.5 py-2 text-[13px]',
													repo.connected ? 'cursor-default opacity-55' : 'hover:bg-mc-accent/[.06]'
												)}
											>
												<input
													type="checkbox"
													disabled={repo.connected}
													checked={checked}
													onChange={() => togglePick(repo.id)}
													className="h-3.5 w-3.5 flex-none accent-mc-accent"
												/>
												<FolderGit2 className="h-4 w-4 flex-none text-mc-accent" />
												<span className="truncate font-mono text-mc-text">{repo.name}</span>
												{repo.private && <Lock className="h-3 w-3 flex-none text-mc-muted" />}
												{repo.connected && <span className="ml-auto flex-none text-[11px] text-mc-text-3">connected</span>}
											</label>
										);
									})}
								</div>
								{picked.size > 0 && (
									<div className="flex items-center justify-between border-t border-mc-hairline px-3.5 py-2.5">
										<button onClick={() => setPicked(new Set())} className="text-[11.5px] text-mc-text-3 hover:text-mc-text">
											Clear
										</button>
										<button
											onClick={() => void connectPicked()}
											disabled={attaching}
											className="rounded-full bg-mc-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-mc-accent-hi disabled:opacity-50"
										>
											{attaching ? 'Connecting…' : `Connect ${picked.size}`}
										</button>
									</div>
								)}
							</GlassCard>
						</>
					)}
				</div>
			) : (
				<GlassCard className="flex flex-col gap-2 p-4">
					<div className="flex flex-wrap items-center gap-3">
						<Link2 className="h-4 w-4 text-mc-text-2" />
						<input
							value={remoteUrl}
							onChange={(e) => setRemoteUrl(e.target.value)}
							placeholder="https://github.com/owner/repo"
							className="h-9 min-w-[240px] flex-1 rounded-lg border border-mc-border bg-mc-surface px-3 font-mono text-sm text-mc-text placeholder:text-mc-muted focus:outline-none focus:ring-1 focus:ring-mc-accent/50"
						/>
						<button
							onClick={doConnect}
							disabled={!remoteUrl.trim() || connect.state.status === 'pending'}
							className="flex items-center gap-2 rounded-full bg-mc-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-glow-accent transition-colors hover:bg-mc-accent-hi disabled:opacity-50"
						>
							{connect.state.status === 'pending' ? 'Connecting…' : 'Connect'}
						</button>
					</div>
					<p className="text-[11.5px] text-mc-text-3">
						{githubIntegration ? (
							<button onClick={() => setManualMode(false)} className="text-mc-accent hover:underline">
								← Browse your GitHub app's repositories instead
							</button>
						) : (
							<>
								Tip: <Link to={`/projects/${project.id}/integrations`} className="text-mc-accent hover:underline">connect your GitHub app</Link> to browse and search
								its repositories instead of pasting URLs.
							</>
						)}
					</p>
				</GlassCard>
			)}
			{connect.state.status === 'error' && <p className="text-sm text-mc-danger">{(connect.state.error as Error).message}</p>}

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
				{/* Repository list */}
				<div className="flex flex-col gap-2.5">
					<div className="flex items-center justify-between">
						<h2 className="text-[13px] font-semibold text-mc-text">Connected repositories</h2>
						<button onClick={refresh} className="flex items-center gap-1.5 text-xs text-mc-text-2 hover:text-mc-text">
							<RefreshCw className="h-3 w-3" /> Refresh
						</button>
					</div>
					<GlassCard className="overflow-hidden">
						{list.state.status === 'pending' && <div className="px-4 py-4 text-sm text-mc-text-3">Loading repositories…</div>}
						{list.state.status === 'success' && repos.length === 0 && (
							<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
								<FolderGit2 className="h-6 w-6 text-mc-muted" />
								<p className="text-sm text-mc-text-3">No repositories connected. Add a GitHub URL above to get started.</p>
							</div>
						)}
						{repos.map((r, i) => {
							const isSel = selected?.id === r.id;
							return (
								<button
									key={r.id}
									onClick={() => setSelectedId(r.id)}
									className={cn(
										'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
										i > 0 && 'border-t border-mc-hairline',
										isSel ? 'bg-mc-accent/[.06]' : 'hover:bg-mc-surface'
									)}
								>
									<FolderGit2 className="h-4 w-4 flex-none text-mc-accent" />
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="truncate font-mono text-[13px] text-mc-text">{r.remoteUrl ?? '(zip upload)'}</span>
										<span className="flex items-center gap-2 font-mono text-[11px] text-mc-muted">
											<span className="capitalize">{r.source}</span>
											{r.defaultBranch && (
												<>
													<GitBranch className="h-3 w-3" />
													{r.defaultBranch}
												</>
											)}
										</span>
									</div>
									<RepoStatusBadge status={r.syncStatus} />
									<button
										onClick={(e) => {
											e.stopPropagation();
											void doSync(r.id);
										}}
										disabled={sync.state.status === 'pending'}
										className="flex items-center gap-1.5 rounded-lg border border-mc-border bg-mc-card px-2.5 py-1.5 text-[11.5px] text-mc-text-3 shadow-e1 transition-colors hover:bg-mc-surface hover:text-mc-text disabled:opacity-50"
									>
										<RefreshCw className="h-3 w-3" /> Sync
									</button>
									<button
										onClick={(e) => {
											e.stopPropagation();
											setPendingDelete(r);
										}}
										title="Disconnect repository"
										className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-mc-border bg-mc-card text-mc-muted shadow-e1 transition-colors hover:border-mc-danger/30 hover:text-mc-danger"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</button>
							);
						})}
					</GlassCard>
					{sync.state.status === 'error' && <p className="text-sm text-mc-danger">{(sync.state.error as Error).message}</p>}
				</div>

				{/* Right rail — repository intelligence (honest ingestion guidance + selected repo details) */}
				<div className="flex flex-col gap-4">
					<BeamCard className="bg-gradient-to-br from-mc-accent/[.08] to-mc-purple/[.10] p-4">
						<div className="flex flex-col gap-2.5">
							<div className="flex items-center gap-2">
								<MeshAvatar size={22} breathe />
								<span className="text-xs font-semibold text-mc-text">Mesh on repositories</span>
							</div>
							<p className="text-[12.5px] leading-relaxed text-mc-text-2">
								Connecting a repository ingests its source into this project's knowledge base: <span className="text-mc-text">clone → parse → embed</span>. Once
								synced, Mesh Chat and Search can ground answers in the code.
							</p>
						</div>
					</BeamCard>

					{selected ? (
						<GlassCard className="flex flex-col gap-3 p-4">
							<Kicker>SELECTED REPOSITORY</Kicker>
							<DataRow label="Source" value={selected.source} />
							<DataRow label="Remote" value={selected.remoteUrl ?? '(zip upload)'} mono />
							<DataRow label="Branch" value={selected.defaultBranch ?? 'default'} mono />
							<DataRow label="Sync status" value={repoStatus(selected.syncStatus).label} />
							<DataRow label="Connected" value={new Date(selected.createdAt).toLocaleString()} />
							{selected.lastError && (
								<div className="mt-1 flex items-start gap-2 rounded-lg border border-mc-danger/30 bg-mc-danger/10 p-2.5">
									<TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none text-mc-danger" />
									<span className="font-mono text-[11px] leading-relaxed text-mc-danger">{selected.lastError}</span>
								</div>
							)}
						</GlassCard>
					) : (
						<GlassCard className="flex flex-col items-center gap-2 p-6 text-center">
							<Sparkles className="h-5 w-5 text-mc-muted" />
							<p className="text-xs text-mc-text-3">Connect a repository to see its ingestion details here.</p>
						</GlassCard>
					)}
				</div>
			</div>

			<Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
				<DialogContent className="border-mc-border bg-mc-card">
					<DialogHeader>
						<DialogTitle>Disconnect this repository?</DialogTitle>
						<DialogDescription>
							“{pendingDelete?.remoteUrl ?? '(zip upload)'}” will be removed from {project.name} — its indexed code, embeddings and file records are deleted, and Mesh will stop grounding answers in it. This can't be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="glass" onClick={() => setPendingDelete(null)} disabled={deleting}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
							{deleting ? 'Disconnecting…' : 'Disconnect repository'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
