import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, RefreshCw, Sparkles, FileText, FolderGit2, ArrowUpRight } from 'lucide-react';
import { api } from '@/api-client';
import type { Repository } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { GlassCard, BeamCard, MeshAvatar, StatusDot, Kicker } from '@/components/mc/primitives';
import { cn } from '@/lib/utils';

const REPO_STATUS: Record<string, { dot: 'success' | 'indexing' | 'muted' | 'danger'; label: string }> = {
	synced: { dot: 'success', label: 'Synced' },
	cloning: { dot: 'indexing', label: 'Cloning' },
	pending: { dot: 'muted', label: 'Pending' },
	failed: { dot: 'danger', label: 'Failed' },
};

/**
 * The "flight deck" project briefing (design 2a), adapted to real functionality:
 * every tile is backed by data the platform-api actually exposes (project
 * configuration + connected repositories). Design widgets with no backend yet
 * (knowledge-coverage %, activity feed, Mesh insights) are intentionally
 * omitted rather than shown with invented numbers.
 */
export function ProjectHomePage() {
	const { project } = useWorkspace();
	const navigate = useNavigate();
	const repos = useAsync<Repository[]>();
	const [question, setQuestion] = useState('');

	useEffect(() => {
		void repos.run(() => api.listRepositories(project.id));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project.id]);

	const repoList = repos.state.status === 'success' ? repos.state.value : [];
	const firstRepo = repoList[0];

	const askMesh = (q: string) => {
		if (!q.trim()) return;
		navigate('../chat', { state: { initialQuestion: q } });
	};

	return (
		<div className="relative flex flex-col gap-6">
			{/* Briefing header + primary actions */}
			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1.5">
					<Kicker>// PROJECT BRIEFING</Kicker>
					<p className="text-sm text-mc-text-3">
						{project.description || 'An isolated, RAG-queryable knowledge base over this project’s documents and code.'}
					</p>
				</div>
				<div className="flex-1" />
				<div className="flex gap-2">
					<HeaderButton to="../documents" icon={<Upload className="h-3.5 w-3.5" />}>
						Upload docs
					</HeaderButton>
					<HeaderButton to="../repository" icon={<RefreshCw className="h-3.5 w-3.5" />}>
						Sync repo
					</HeaderButton>
					<Link
						to="../chat"
						className="flex items-center gap-2 rounded-lg bg-mc-accent px-4 py-2 text-[12.5px] font-semibold text-mc-bg shadow-[0_0_20px_rgba(227,154,76,.3)] transition-colors hover:bg-mc-accent-hi"
					>
						<Sparkles className="h-3.5 w-3.5" /> Ask Mesh
					</Link>
				</div>
			</div>

			{/* Health strip — real project configuration */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="REPOSITORY">
					{repos.state.status === 'pending' ? (
						<span className="text-sm text-mc-text-3">Loading…</span>
					) : firstRepo ? (
						<>
							<div className="flex items-baseline gap-2">
								<span className="font-mono text-lg font-semibold text-mc-text">{firstRepo.defaultBranch ?? 'main'}</span>
								<StatusDot color={REPO_STATUS[firstRepo.syncStatus]?.dot ?? 'muted'} glow />
							</div>
							<span className="text-xs text-mc-text-3">
								{REPO_STATUS[firstRepo.syncStatus]?.label ?? firstRepo.syncStatus} · {repoList.length} connected
							</span>
						</>
					) : (
						<>
							<span className="text-lg font-semibold text-mc-text-3">None</span>
							<Link to="../repository" className="text-xs text-mc-accent hover:text-mc-accent-hi">
								Connect a repository →
							</Link>
						</>
					)}
				</MetricCard>

				<MetricCard label="LLM PROFILE">
					<span className="font-mono text-lg font-semibold text-mc-text">{project.llmProfile}</span>
					<span className="text-xs text-mc-text-3">answers generated with this model</span>
				</MetricCard>

				<MetricCard label="EMBEDDING PROFILE">
					<span className="truncate font-mono text-lg font-semibold text-mc-text">{project.embeddingProfile}</span>
					<span className="text-xs text-mc-text-3">shared by ingest + retrieval</span>
				</MetricCard>

				<MetricCard label="STATUS" accent>
					<div className="flex items-baseline gap-2">
						<span className="text-lg font-semibold capitalize text-mc-accent-hi">{project.status}</span>
						<StatusDot color={project.status === 'active' ? 'success' : 'muted'} glow />
					</div>
					<span className="text-xs text-mc-text-3">created {new Date(project.createdAt).toLocaleDateString()}</span>
				</MetricCard>
			</div>

			{/* Two-column body */}
			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
				{/* Left: quick start + repositories */}
				<div className="flex flex-col gap-5">
					<section className="flex flex-col gap-2.5">
						<div className="flex items-center gap-2">
							<Sparkles className="h-3.5 w-3.5 text-mc-accent" />
							<h2 className="text-[13px] font-semibold text-mc-text">Get started</h2>
						</div>
						<div className="flex flex-col gap-2">
							<BeamCard className="bg-gradient-to-r from-mc-accent/[.08] to-[rgba(18,18,24,.55)]">
								<QuickAction
									icon={<FileText className="h-4 w-4 text-mc-accent" />}
									title="Upload documents"
									body="PDF, DOCX, PPTX, TXT or Markdown — ingested into this project's knowledge base."
									cta="Upload"
									to="../documents"
								/>
							</BeamCard>
							<GlassCard>
								<QuickAction
									icon={<FolderGit2 className="h-4 w-4 text-mc-text-2" />}
									title="Connect a repository"
									body="Point Mesh at a GitHub repo so it can answer questions grounded in your source code."
									cta="Connect"
									to="../repository"
									subtle
								/>
							</GlassCard>
						</div>
					</section>

					<section className="flex min-h-0 flex-col gap-2.5">
						<div className="flex items-center justify-between">
							<h2 className="text-[13px] font-semibold text-mc-text">Repositories</h2>
							<Link to="../repository" className="text-xs font-medium text-mc-accent hover:text-mc-accent-hi">
								Manage →
							</Link>
						</div>
						<GlassCard className="overflow-hidden">
							{repos.state.status === 'pending' && <div className="px-4 py-3 text-sm text-mc-text-3">Loading repositories…</div>}
							{repos.state.status === 'success' && repoList.length === 0 && (
								<div className="px-4 py-3 text-sm text-mc-text-3">No repositories connected yet.</div>
							)}
							{repoList.map((r, i) => (
								<div key={r.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-white/[.05]')}>
									<FolderGit2 className="h-3.5 w-3.5 text-mc-teal" />
									<span className="flex-1 truncate font-mono text-xs text-mc-text">{r.remoteUrl ?? '(zip upload)'}</span>
									<span className="flex items-center gap-1.5 rounded-full bg-white/[.04] px-2 py-0.5 font-mono text-[10px] text-mc-text-2">
										<StatusDot color={REPO_STATUS[r.syncStatus]?.dot ?? 'muted'} />
										{r.syncStatus}
									</span>
								</div>
							))}
						</GlassCard>
					</section>
				</div>

				{/* Right: configuration + ask mesh */}
				<div className="flex flex-col gap-5">
					<section className="flex flex-col gap-2.5">
						<h2 className="text-[13px] font-semibold text-mc-text">Configuration</h2>
						<GlassCard className="flex flex-col gap-3 p-4">
							<ConfigRow label="Project ID" value={project.id} mono />
							<ConfigRow label="Organization" value={project.orgId} mono />
							<ConfigRow label="LLM profile" value={project.llmProfile} />
							<ConfigRow label="Embedding profile" value={project.embeddingProfile} />
							<ConfigRow label="Updated" value={new Date(project.updatedAt).toLocaleString()} />
						</GlassCard>
					</section>

					<section className="flex flex-col gap-2.5">
						<h2 className="text-[13px] font-semibold text-mc-text">Ask Mesh</h2>
						<GlassCard className="flex flex-col gap-3 p-4">
							<div className="flex items-center gap-2.5">
								<MeshAvatar size={26} breathe />
								<p className="text-xs text-mc-text-3">Grounded, cited answers over this project's knowledge.</p>
							</div>
							<form
								onSubmit={(e) => {
									e.preventDefault();
									askMesh(question);
								}}
								className="flex items-center gap-2 rounded-lg border border-white/[.1] bg-mc-surface px-3 py-2"
							>
								<input
									value={question}
									onChange={(e) => setQuestion(e.target.value)}
									placeholder="Ask about this project…"
									className="flex-1 bg-transparent text-sm text-mc-text placeholder:text-mc-muted focus:outline-none"
								/>
								<button
									type="submit"
									disabled={!question.trim()}
									className="flex h-7 w-7 items-center justify-center rounded-md bg-mc-accent text-mc-bg disabled:opacity-40"
								>
									<ArrowUpRight className="h-4 w-4" />
								</button>
							</form>
							<div className="flex flex-wrap gap-1.5">
								{['What is this project about?', 'Summarize the ingested knowledge'].map((s) => (
									<button
										key={s}
										onClick={() => askMesh(s)}
										className="rounded-full border border-white/[.08] bg-white/[.03] px-3 py-1.5 text-xs text-mc-text-2 transition-colors hover:border-mc-accent/40 hover:text-mc-text"
									>
										{s}
									</button>
								))}
							</div>
						</GlassCard>
					</section>
				</div>
			</div>

			{/* Floating Ask Mesh dock */}
			<Link
				to="../chat"
				className="fixed bottom-6 right-8 z-20 flex animate-float items-center gap-2 rounded-full bg-mc-accent shadow-[0_10px_30px_rgba(227,154,76,.28)] transition-colors hover:bg-mc-accent-hi"
				style={{ padding: '10px 18px' }}
			>
				<Sparkles className="h-3.5 w-3.5 text-mc-bg" />
				<span className="text-[13px] font-semibold text-mc-bg">Ask Mesh</span>
			</Link>
		</div>
	);
}

function HeaderButton({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
	return (
		<Link
			to={to}
			className="flex items-center gap-2 rounded-lg border border-white/[.09] bg-white/[.03] px-3.5 py-2 text-[12.5px] font-medium text-mc-text-2 backdrop-blur-[8px] transition-colors hover:bg-white/[.06] hover:text-mc-text"
		>
			{icon}
			{children}
		</Link>
	);
}

function MetricCard({ label, children, accent = false }: { label: string; children: ReactNode; accent?: boolean }) {
	return (
		<div
			className={cn(
				'flex flex-col gap-2 rounded-xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-[10px]',
				accent ? 'border-mc-accent/[.16] bg-mc-accent/[.05]' : 'border-white/[.06] bg-[rgba(18,18,24,.55)]'
			)}
		>
			<span className={cn('font-mono text-[10px] tracking-[0.1em]', accent ? 'text-mc-accent/80' : 'text-mc-muted-2')}>{label}</span>
			{children}
		</div>
	);
}

function QuickAction({
	icon,
	title,
	body,
	cta,
	to,
	subtle = false,
}: {
	icon: ReactNode;
	title: string;
	body: string;
	cta: string;
	to: string;
	subtle?: boolean;
}) {
	return (
		<div className="flex items-center gap-3 p-3.5">
			{icon}
			<div className="flex flex-1 flex-col gap-0.5">
				<span className="text-[13px] font-medium text-mc-text">{title}</span>
				<span className="text-xs text-mc-text-3">{body}</span>
			</div>
			<Link
				to={to}
				className={cn(
					'whitespace-nowrap rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors',
					subtle
						? 'border border-white/[.09] bg-white/[.04] text-mc-text-2 hover:text-mc-text'
						: 'bg-mc-accent text-mc-bg hover:bg-mc-accent-hi'
				)}
			>
				{cta}
			</Link>
		</div>
	);
}

function ConfigRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-xs text-mc-text-3">{label}</span>
			<span className={cn('truncate text-right text-xs text-mc-text', mono && 'font-mono')}>{value}</span>
		</div>
	);
}
