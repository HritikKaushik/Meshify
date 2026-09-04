import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Lock, RefreshCw, Unplug, MessagesSquare, FolderGit2, Building2, ChevronDown } from 'lucide-react';
import { api } from '@/api-client';
import type { Integration, IntegrationHealth, ProviderCatalogEntry } from '@/api';
import { useWorkspace } from '@/lib/workspace-context';
import { useAsync, EMPTY } from '@/ui';
import { GlassCard, Kicker, StatusDot, type DotColor } from '@/components/mc/primitives';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRefreshOnJobComplete } from '@/components/jobs/JobsProvider';
import { ByoaConfigDialog } from './ByoaConfigDialog';
import { AiModelsSection } from './AiModelsSection';
import { ProviderBrandIcon } from '@/components/ProviderBrandIcon';
import { cn } from '@/lib/utils';

const HEALTH_PRESENTATION: Record<IntegrationHealth, { label: string; color: DotColor }> = {
	unknown: { label: 'Health unknown', color: 'muted' },
	healthy: { label: 'Healthy', color: 'success' },
	syncing: { label: 'Syncing', color: 'indexing' },
	token_expired: { label: 'Token expired', color: 'accent' },
	permission_changed: { label: 'Permissions changed', color: 'accent' },
	webhook_broken: { label: 'Webhook broken', color: 'accent' },
	needs_reauthorization: { label: 'Needs reauthorization', color: 'danger' },
	partially_connected: { label: 'Partially connected', color: 'accent' },
	disconnected: { label: 'Disconnected', color: 'danger' },
};

function HealthPill({ health }: { health: IntegrationHealth }) {
	const view = HEALTH_PRESENTATION[health] ?? HEALTH_PRESENTATION.unknown;
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full bg-mc-raised px-2.5 py-1 text-[11.5px] font-medium text-mc-text-2">
			<StatusDot color={view.color} glow={health === 'healthy'} />
			{view.label}
		</span>
	);
}

/** A collapsible segment grouping provider cards (Connected vs Available). */
function CollapsibleSection({ title, count, defaultOpen = true, children }: { title: string; count: number; defaultOpen?: boolean; children: ReactNode }) {
	const [open, setOpen] = useState(defaultOpen);
	const reduce = useReducedMotion();
	return (
		<section>
			<button onClick={() => setOpen((o) => !o)} className="group flex w-full items-center gap-2 border-b border-mc-hairline pb-2.5 text-left" aria-expanded={open}>
				<ChevronDown className={cn('h-4 w-4 text-mc-muted-2 transition-transform duration-200', !open && '-rotate-90')} />
				<Kicker className="text-mc-text-3">{title}</Kicker>
				<span className="rounded-full bg-mc-surface px-2 py-0.5 font-mono text-micro text-mc-text-3">{count}</span>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={reduce ? false : { height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={reduce ? undefined : { height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
						className="overflow-hidden"
					>
						<div className="pt-4">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

/**
 * The Integration Marketplace (project-scoped view of org-level integrations):
 * every provider in the catalog as a card, with capability-driven affordances.
 * Connect once per org; projects attach resources. Live updates ride the
 * org-scoped integrations SSE stream + the existing jobs stream.
 */
export function IntegrationsPage() {
	const { project } = useWorkspace();
	const navigate = useNavigate();
	const catalog = useAsync<ProviderCatalogEntry[]>();
	const orgIntegrations = useAsync<Integration[]>();
	const [busyProvider, setBusyProvider] = useState<string | null>(null);
	const [disconnecting, setDisconnecting] = useState<Integration | null>(null);
	const [byoaFor, setByoaFor] = useState<{ provider: string; providerName: string; accountName?: string } | null>(null);

	const refresh = useCallback(() => {
		void catalog.run(() => api.listProviders());
		void orgIntegrations.run(() => api.listIntegrations());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	// Live org events: OAuth completions, revocations, health flips. Events that
	// fired while the stream was down are not replayed, so a reconnect refreshes.
	useEffect(() => {
		const source = new EventSource(api.integrationsStreamUrl(), { withCredentials: true });
		let wasDown = false;
		source.onmessage = () => refresh();
		source.onerror = () => {
			wasDown = true;
		};
		source.onopen = () => {
			if (wasDown) {
				wasDown = false;
				refresh();
			}
		};
		return () => source.close();
	}, [refresh]);

	useRefreshOnJobComplete(['source_sync', 'clone_repo', 'sync_repo', 'slack_ingest', 'slack_sync'], refresh);

	const providers = catalog.data ?? EMPTY;
	const integrations = orgIntegrations.data ?? EMPTY;
	const integrationsByProvider = useMemo(() => {
		const map = new Map<string, Integration>();
		// Prefer the active claim when an org somehow holds several for one provider.
		for (const integration of integrations) {
			const existing = map.get(integration.provider);
			if (!existing || (existing.status !== 'active' && integration.status === 'active')) map.set(integration.provider, integration);
		}
		return map;
	}, [integrations]);

	const connectedProviders = providers.filter((p) => integrationsByProvider.has(p.id));
	const availableProviders = providers.filter((p) => !integrationsByProvider.has(p.id));

	async function beginConnect(provider: ProviderCatalogEntry) {
		setBusyProvider(provider.id);
		try {
			const { url } = await api.connectProvider(provider.id, {
				projectId: project.id,
				returnPath: `/projects/${project.id}/integrations`,
			});
			window.location.href = url;
		} catch (err) {
			toast.error((err as Error).message);
			setBusyProvider(null);
		}
	}

	async function beginReconnect(integration: Integration) {
		setBusyProvider(integration.provider);
		try {
			const { url } = await api.reconnectIntegration(integration.id, `/projects/${project.id}/integrations`);
			window.location.href = url;
		} catch (err) {
			toast.error((err as Error).message);
			setBusyProvider(null);
		}
	}

	async function confirmDisconnect() {
		if (!disconnecting) return;
		try {
			await api.disconnectIntegration(disconnecting.id);
			toast.success(`${disconnecting.externalAccountName} disconnected`);
			setDisconnecting(null);
			refresh();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function attachSlack(integration: Integration) {
		try {
			const result = await api.attachSlackWorkspace(project.id, integration.id);
			toast.success(result.alreadyAttached ? 'Workspace already attached — pick channels' : `${result.teamName ?? 'Workspace'} attached (${result.channelCount} channels found)`);
			void navigate(`/projects/${project.id}/slack`);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	const renderCard = (provider: ProviderCatalogEntry) => {
		const integration = integrationsByProvider.get(provider.id);
		const connected = integration && integration.status === 'active';
		return (
			<GlassCard key={provider.id} className="flex flex-col gap-4 p-5">
				<div className="flex items-start justify-between gap-4">
					<div className="flex min-w-0 items-start gap-3">
						<span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-mc-border bg-mc-text/[.05] text-mc-text">
							<ProviderBrandIcon iconKey={provider.iconKey} size={18} />
						</span>
						<div className="min-w-0">
							<div className="flex items-center gap-2 text-[14px] font-semibold text-mc-text">
								{provider.displayName}
								<span className="rounded-full bg-mc-raised px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-mc-text-3">{provider.category}</span>
							</div>
							<p className="mt-1 text-[12.5px] leading-relaxed text-mc-text-3">{provider.summary}</p>
						</div>
					</div>
					{integration && (
						<div className="flex-none">
							<HealthPill health={integration.health} />
						</div>
					)}
				</div>

				{integration ? (
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-[12.5px] text-mc-text-2">
							<StatusDot color={connected ? 'success' : 'danger'} />
							<span className="font-medium">{integration.externalAccountName}</span>
							<span className="text-mc-text-3">
								· {integration.connectorCount} source{integration.connectorCount === 1 ? '' : 's'} across {integration.connectedProjectIds.length}{' '}
								project{integration.connectedProjectIds.length === 1 ? '' : 's'}
							</span>
						</div>
						{integration.lastError && <p className="text-[12px] text-mc-danger">{integration.lastError}</p>}
						<div className="flex flex-wrap items-center gap-2 pt-0.5">
							{connected && provider.capabilities.resourcePicker && provider.category === 'code' && (
								<Button variant="mesh" size="sm" asChild>
									<Link to={`/projects/${project.id}/repository`}>
										<FolderGit2 size={14} className="mr-1.5" /> Manage repositories
									</Link>
								</Button>
							)}
							{connected && provider.capabilities.resourcePicker && provider.category === 'chat' && (
								<Button variant="mesh" size="sm" onClick={() => void attachSlack(integration)}>
									<MessagesSquare size={14} className="mr-1.5" /> Attach to this project
								</Button>
							)}
							{!connected && provider.capabilities.oauth && (
								<Button variant="mesh" size="sm" disabled={busyProvider === provider.id} onClick={() => void beginConnect(provider)}>
									Connect again
								</Button>
							)}
							{provider.capabilities.oauth && (
								<Button variant="glass" size="sm" disabled={busyProvider === provider.id} onClick={() => void beginReconnect(integration)}>
									<RefreshCw size={14} className="mr-1.5" /> Reconnect
								</Button>
							)}
							{provider.capabilities.byoa && (
								<Button
									variant="glass"
									size="sm"
									onClick={() => setByoaFor({ provider: provider.id, providerName: provider.displayName, accountName: integration.externalAccountName })}
								>
									<Building2 size={14} className="mr-1.5" /> {integration.mode === 'byoa' ? 'Enterprise app' : 'Use own app'}
								</Button>
							)}
							<Button variant="ghost" size="sm" className="ml-auto text-mc-danger hover:bg-mc-danger/10" onClick={() => setDisconnecting(integration)}>
								<Unplug size={14} className="mr-1.5" /> Disconnect
							</Button>
						</div>
					</div>
				) : provider.availability === 'coming_soon' ? (
					<span className="w-fit rounded-full bg-mc-raised px-3 py-1 text-[11.5px] font-medium text-mc-text-3">Coming soon</span>
				) : !provider.configured ? (
					<div className="space-y-2.5">
						<p className="text-[12.5px] text-mc-text-3">
							<Lock size={12} className="mr-1 inline" />
							{provider.capabilities.byoa
								? `No managed ${provider.displayName} app on this deployment — bring your organization's own app to enable it.`
								: `Not configured on this deployment — ask your operator to set up the ${provider.displayName} app.`}
						</p>
						{provider.capabilities.byoa && (
							<Button variant="glass" size="sm" className="w-fit" onClick={() => setByoaFor({ provider: provider.id, providerName: provider.displayName })}>
								<Building2 size={14} className="mr-1.5" /> Use own app
							</Button>
						)}
					</div>
				) : (
					<Button variant="mesh" size="sm" className="w-fit" disabled={busyProvider === provider.id} onClick={() => void beginConnect(provider)}>
						Connect {provider.displayName}
					</Button>
				)}
			</GlassCard>
		);
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
			<div>
				<Kicker>Integrations</Kicker>
				<h1 className="mt-1 text-xl font-semibold text-mc-text">Connect your knowledge sources</h1>
				<p className="mt-1 text-[13px] text-mc-text-3">
					Authorize a provider once for your whole organization, then attach its repositories, channels, and documents to this project. Syncs run
					automatically on webhooks — no keys, no manual setup.
				</p>
			</div>

			{catalog.state.status === 'error' && <p className="text-sm text-mc-danger">{catalog.state.error.message}</p>}

			<div className="space-y-6">
				<AiModelsSection />

				<CollapsibleSection title="Connected" count={connectedProviders.length} defaultOpen>
					{connectedProviders.length ? (
						<div className="grid gap-4 sm:grid-cols-2">{connectedProviders.map(renderCard)}</div>
					) : (
						<p className="text-[13px] text-mc-text-3">No sources connected to your organization yet — connect one from Available below.</p>
					)}
				</CollapsibleSection>

				<CollapsibleSection title="Available" count={availableProviders.length} defaultOpen>
					<div className="grid gap-4 sm:grid-cols-2">{availableProviders.map(renderCard)}</div>
				</CollapsibleSection>
			</div>

			{byoaFor && (
				<ByoaConfigDialog
					provider={byoaFor.provider}
					providerName={byoaFor.providerName}
					accountName={byoaFor.accountName}
					onClose={() => setByoaFor(null)}
					onSaved={refresh}
				/>
			)}

			<Dialog open={disconnecting !== null} onOpenChange={(open) => !open && setDisconnecting(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Disconnect {disconnecting?.externalAccountName}?</DialogTitle>
						<DialogDescription>
							This disconnects the integration for your whole organization: credentials are deleted and every project source that uses it stops
							syncing. Already-ingested knowledge stays searchable until its sources are deleted.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="glass" onClick={() => setDisconnecting(null)}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={() => void confirmDisconnect()}>
							Disconnect
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
