import { useEffect, useState } from 'react';
import { Hash, Lock, MessagesSquare, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api-client';
import type { Connector, SlackChannelSummary } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { useRefreshOnJobComplete } from '@/components/jobs/JobsProvider';
import { GlassCard, BeamCard, MeshAvatar, Kicker } from '@/components/mc/primitives';
import { DataRow } from '@/components/common/DataRow';
import { ConnectorStatusBadge } from '@/components/common/ConnectorStatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const OAUTH_PROJECT_KEY = 'meshify.slackOAuthProjectId';

/**
 * Slack knowledge source (part of the generic Connector Framework). Connect a
 * workspace via OAuth, pick which channels to ingest, drive an incremental sync,
 * and disconnect — the same shape as the Repository/Documents sources. Slack
 * conversations are grouped into semantic documents and grounded in Chat/Search
 * alongside code and docs.
 */
export function SlackPage() {
	const { project } = useWorkspace();
	const list = useAsync<Connector[]>();
	const channels = useAsync<SlackChannelSummary[]>();
	const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const [starting, setStarting] = useState(false);
	const [saving, setSaving] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<Connector | null>(null);
	const [deleting, setDeleting] = useState(false);

	const refresh = () => list.run(() => api.listConnectors(project.id).then((all) => all.filter((c) => c.type === 'slack')));

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project.id]);

	// Real-time: refresh workspace stats when a Slack ingest/sync job finishes (progress shown in the Job Progress Center).
	useRefreshOnJobComplete(['slack_ingest', 'slack_sync'], refresh);

	const connectors = list.state.status === 'success' ? list.state.value : [];
	const selected = connectors.find((c) => c.id === selectedConnectorId) ?? connectors[0];

	// Load channels whenever the selected workspace changes.
	useEffect(() => {
		if (!selected) return;
		void channels.run(async () => {
			const chans = await api.listSlackChannels(project.id, selected.id);
			setChecked(new Set(chans.filter((c) => c.selected).map((c) => c.channelId)));
			return chans;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected?.id]);

	const startConnect = async () => {
		setStarting(true);
		try {
			const { authorizeUrl } = await api.startSlackOAuth(project.id);
			// The redirect URI is static; stash the project so the callback route can complete the flow.
			sessionStorage.setItem(OAUTH_PROJECT_KEY, project.id);
			window.location.href = authorizeUrl;
		} catch (err) {
			toast.error((err as Error).message);
			setStarting(false);
		}
	};

	const toggleChannel = (channelId: string) => {
		setChecked((prev) => {
			const next = new Set(prev);
			if (next.has(channelId)) next.delete(channelId);
			else next.add(channelId);
			return next;
		});
	};

	const saveSelection = async () => {
		if (!selected) return;
		setSaving(true);
		try {
			await api.selectSlackChannels(project.id, selected.id, [...checked]);
			// Ingestion progress now appears in the Job Progress Center — no background toast.
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setSaving(false);
		}
	};

	const doSync = async (connectorId: string) => {
		try {
			await api.syncSlack(project.id, connectorId);
			// Sync progress now appears in the Job Progress Center — no background toast.
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		}
	};

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		setDeleting(true);
		try {
			await api.deleteConnector(project.id, pendingDelete.id);
			toast.success('Slack workspace disconnected');
			if (selectedConnectorId === pendingDelete.id) setSelectedConnectorId(null);
			setPendingDelete(null);
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setDeleting(false);
		}
	};

	const chans = channels.state.status === 'success' ? channels.state.value : [];

	return (
		<div className="flex flex-col gap-5">
			{/* Connect bar */}
			<GlassCard className="flex flex-wrap items-center gap-3 p-4">
				<MessagesSquare className="h-4 w-4 text-mc-text-2" />
				<div className="flex min-w-[200px] flex-1 flex-col">
					<span className="text-[13px] font-semibold text-mc-text">Connect a Slack workspace</span>
					<span className="text-[12px] text-mc-muted">Meshify reads channel history you choose and grounds Chat/Search in it.</span>
				</div>
				<button
					onClick={startConnect}
					disabled={starting}
					className="flex items-center gap-2 rounded-full bg-mc-accent px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_6px_16px_rgba(26,115,232,.26)] transition-colors hover:bg-mc-accent-hi disabled:opacity-50"
				>
					{starting ? 'Redirecting…' : 'Add to Slack'}
				</button>
			</GlassCard>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
				{/* Workspaces + channel picker */}
				<div className="flex flex-col gap-2.5">
					<div className="flex items-center justify-between">
						<h2 className="text-[13px] font-semibold text-mc-text">Connected workspaces</h2>
						<button onClick={refresh} className="flex items-center gap-1.5 text-xs text-mc-text-2 hover:text-mc-text">
							<RefreshCw className="h-3 w-3" /> Refresh
						</button>
					</div>

					<GlassCard className="overflow-hidden">
						{list.state.status === 'pending' && <div className="px-4 py-4 text-sm text-mc-text-3">Loading workspaces…</div>}
						{list.state.status === 'success' && connectors.length === 0 && (
							<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
								<MessagesSquare className="h-6 w-6 text-mc-muted" />
								<p className="text-sm text-mc-text-3">No Slack workspaces connected. Use “Add to Slack” above to get started.</p>
							</div>
						)}
						{connectors.map((c, i) => {
							const isSel = selected?.id === c.id;
							return (
								<button
									key={c.id}
									onClick={() => setSelectedConnectorId(c.id)}
									className={cn(
										'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
										i > 0 && 'border-t border-black/[.05]',
										isSel ? 'bg-mc-accent/[.06]' : 'hover:bg-mc-surface'
									)}
								>
									<MessagesSquare className="h-4 w-4 flex-none text-mc-accent" />
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="truncate text-[13px] font-medium text-mc-text">{c.displayName}</span>
										<span className="font-mono text-[11px] text-mc-muted">
											{c.itemCount} conversation{c.itemCount === 1 ? '' : 's'} · {c.embeddedCount} embedded
										</span>
									</div>
									<ConnectorStatusBadge status={c.status} />
									<button
										onClick={(e) => {
											e.stopPropagation();
											void doSync(c.id);
										}}
										className="flex items-center gap-1.5 rounded-lg border border-black/[.09] bg-white px-2.5 py-1.5 text-[11.5px] text-mc-text-3 shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-colors hover:text-mc-text"
									>
										<RefreshCw className="h-3 w-3" /> Sync
									</button>
									<button
										onClick={(e) => {
											e.stopPropagation();
											setPendingDelete(c);
										}}
										title="Disconnect workspace"
										className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-black/[.09] bg-white text-mc-muted shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-colors hover:border-mc-danger/30 hover:text-mc-danger"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</button>
							);
						})}
					</GlassCard>

					{/* Channel picker for the selected workspace */}
					{selected && (
						<GlassCard className="flex flex-col gap-3 p-4">
							<div className="flex items-center justify-between">
								<Kicker>CHANNELS TO INGEST</Kicker>
								<button
									onClick={saveSelection}
									disabled={saving || channels.state.status === 'pending'}
									className="rounded-full bg-mc-accent px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(26,115,232,.26)] transition-colors hover:bg-mc-accent-hi disabled:opacity-50"
								>
									{saving ? 'Saving…' : 'Save & ingest'}
								</button>
							</div>
							{channels.state.status === 'pending' && <p className="text-sm text-mc-text-3">Loading channels…</p>}
							{channels.state.status === 'success' && chans.length === 0 && (
								<p className="text-sm text-mc-text-3">No channels visible to the Slack app. Invite the bot to channels, then Refresh.</p>
							)}
							<div className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto">
								{chans.map((ch) => (
									<label key={ch.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-mc-surface">
										<input type="checkbox" checked={checked.has(ch.channelId)} onChange={() => toggleChannel(ch.channelId)} className="h-3.5 w-3.5 accent-mc-accent" />
										{ch.isPrivate ? <Lock className="h-3 w-3 text-mc-muted" /> : <Hash className="h-3 w-3 text-mc-muted" />}
										<span className="truncate text-[13px] text-mc-text">{ch.name ?? ch.channelId}</span>
									</label>
								))}
							</div>
						</GlassCard>
					)}
				</div>

				{/* Right rail — Mesh guidance + selected workspace details */}
				<div className="flex flex-col gap-4">
					<BeamCard className="bg-gradient-to-br from-[#F4F7FF] to-[#F6F5FF] p-4">
						<div className="flex flex-col gap-2.5">
							<div className="flex items-center gap-2">
								<MeshAvatar size={22} breathe />
								<span className="text-xs font-semibold text-mc-text">Mesh on Slack</span>
							</div>
							<p className="text-[12.5px] leading-relaxed text-mc-text-2">
								Channel history is grouped into <span className="text-mc-text">semantic conversations</span> (threads and time windows), not individual messages, then embedded
								alongside your code and documents. Chat citations link back to the Slack channel, thread, author and permalink.
							</p>
						</div>
					</BeamCard>

					{selected ? (
						<GlassCard className="flex flex-col gap-3 p-4">
							<Kicker>SELECTED WORKSPACE</Kicker>
							<DataRow label="Workspace" value={selected.displayName} />
							<DataRow label="Status" value={selected.status} />
							<DataRow label="Conversations" value={String(selected.itemCount)} />
							<DataRow label="Embedded" value={String(selected.embeddedCount)} />
							<DataRow label="Channels selected" value={String((selected.detail.selectedChannelCount as number | undefined) ?? checked.size)} />
							<DataRow label="Connected" value={new Date(selected.createdAt).toLocaleString()} />
						</GlassCard>
					) : (
						<GlassCard className="flex flex-col items-center gap-2 p-6 text-center">
							<Sparkles className="h-5 w-5 text-mc-muted" />
							<p className="text-xs text-mc-text-3">Connect a workspace to pick channels and see ingestion details.</p>
						</GlassCard>
					)}
				</div>
			</div>

			<Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
				<DialogContent className="border-black/[.08] bg-white">
					<DialogHeader>
						<DialogTitle>Disconnect this Slack workspace?</DialogTitle>
						<DialogDescription>
							“{pendingDelete?.displayName}” will be removed from {project.name} — its ingested conversations, embeddings and sync state are deleted, and Mesh will stop grounding
							answers in it. This can't be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="glass" onClick={() => setPendingDelete(null)} disabled={deleting}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
							{deleting ? 'Disconnecting…' : 'Disconnect workspace'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
