import { useEffect, useState } from 'react';
import { FolderGit2, Link2, RefreshCw, Sparkles, GitBranch, TriangleAlert } from 'lucide-react';
import { api } from '@/api-client';
import type { Repository } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { GlassCard, BeamCard, MeshAvatar, Kicker } from '@/components/mc/primitives';
import { DataRow } from '@/components/common/DataRow';
import { RepoStatusBadge } from '@/components/common/RepoStatusBadge';
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
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const list = useAsync<Repository[]>();
	const connect = useAsync<unknown>();
	const sync = useAsync<unknown>();

	const refresh = () => list.run(() => api.listRepositories(project.id));

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project.id]);

	const repos = list.state.status === 'success' ? list.state.value : [];
	const selected = repos.find((r) => r.id === selectedId) ?? repos[0];

	const doConnect = async () => {
		if (!remoteUrl.trim()) return;
		await connect.run(() => api.connectGitHub(project.id, remoteUrl));
		setRemoteUrl('');
		await refresh();
	};

	const doSync = async (id: string) => {
		await sync.run(() => api.syncRepository(project.id, id));
		await refresh();
	};

	return (
		<div className="flex flex-col gap-5">
			{/* Connect bar */}
			<GlassCard className="flex flex-wrap items-center gap-3 p-4">
				<Link2 className="h-4 w-4 text-mc-text-2" />
				<input
					value={remoteUrl}
					onChange={(e) => setRemoteUrl(e.target.value)}
					placeholder="https://github.com/owner/repo"
					className="h-9 min-w-[240px] flex-1 rounded-lg border border-white/[.09] bg-mc-surface px-3 font-mono text-sm text-mc-text placeholder:text-mc-muted focus:outline-none focus:ring-1 focus:ring-mc-accent/50"
				/>
				<button
					onClick={doConnect}
					disabled={!remoteUrl.trim() || connect.state.status === 'pending'}
					className="flex items-center gap-2 rounded-lg bg-mc-accent px-4 py-2 text-[12.5px] font-semibold text-mc-bg shadow-[0_0_16px_rgba(227,154,76,.25)] transition-colors hover:bg-mc-accent-hi disabled:opacity-50"
				>
					{connect.state.status === 'pending' ? 'Connecting…' : 'Connect'}
				</button>
			</GlassCard>
			{connect.state.status === 'error' && (
				<p className="text-sm text-mc-danger">{(connect.state.error as Error).message}</p>
			)}

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
										i > 0 && 'border-t border-white/[.05]',
										isSel ? 'bg-mc-accent/[.06]' : 'hover:bg-white/[.03]'
									)}
								>
									<FolderGit2 className="h-4 w-4 flex-none text-mc-teal" />
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
										className="flex items-center gap-1.5 rounded-lg border border-white/[.09] bg-white/[.04] px-2.5 py-1.5 text-[11.5px] text-mc-text-2 transition-colors hover:text-mc-text disabled:opacity-50"
									>
										<RefreshCw className="h-3 w-3" /> Sync
									</button>
								</button>
							);
						})}
					</GlassCard>
					{sync.state.status === 'error' && <p className="text-sm text-mc-danger">{(sync.state.error as Error).message}</p>}
				</div>

				{/* Right rail — repository intelligence (honest ingestion guidance + selected repo details) */}
				<div className="flex flex-col gap-4">
					<BeamCard className="bg-gradient-to-br from-mc-accent/[.09] to-[rgba(18,18,24,.5)] p-4">
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
		</div>
	);
}
