import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, RefreshCw, Unplug, FolderGit2, MessagesSquare } from 'lucide-react';
import { api } from '@/api-client';
import type { Integration, IntegrationHealth, IntegrationResource, ProviderCatalogEntry } from '@/api';
import { useWorkspace } from '@/lib/workspace-context';
import { useAsync } from '@/ui';
import { GlassCard, Kicker, StatusDot, type DotColor } from '@/components/mc/primitives';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRefreshOnJobComplete } from '@/components/jobs/JobsProvider';
import { ByoaConfigDialog } from './ByoaConfigDialog';
import { Building2 } from 'lucide-react';
import { ProviderBrandIcon, COLORED_BRAND_ICON_KEYS } from '@/components/ProviderBrandIcon';

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
	const [picker, setPicker] = useState<{ integration: Integration; provider: ProviderCatalogEntry } | null>(null);
	const [disconnecting, setDisconnecting] = useState<Integration | null>(null);
	const [byoaFor, setByoaFor] = useState<{ provider: string; providerName: string; accountName?: string } | null>(null);

	const refresh = useCallback(() => {
		catalog.run(() => api.listProviders());
		orgIntegrations.run(() => api.listIntegrations());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	// Live org events: OAuth completions, revocations, health flips.
	useEffect(() => {
		const source = new EventSource(api.integrationsStreamUrl(), { withCredentials: true });
		source.onmessage = () => refresh();
		return () => source.close();
	}, [refresh]);

	useRefreshOnJobComplete(['source_sync', 'clone_repo', 'sync_repo', 'slack_ingest', 'slack_sync'], refresh);

	const providers = catalog.state.status === 'success' ? catalog.state.value : [];
	const integrations = orgIntegrations.state.status === 'success' ? orgIntegrations.state.value : [];
	const integrationsByProvider = useMemo(() => {
		const map = new Map<string, Integration>();
		// Prefer the active claim when an org somehow holds several for one provider.
		for (const integration of integrations) {
			const existing = map.get(integration.provider);
			if (!existing || (existing.status !== 'active' && integration.status === 'active')) map.set(integration.provider, integration);
		}
		return map;
	}, [integrations]);

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
			navigate(`/projects/${project.id}/slack`);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

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

			<div className="grid gap-4 sm:grid-cols-2">
				{providers.map((provider) => {
					const integration = integrationsByProvider.get(provider.id);
					const connected = integration && integration.status === 'active';
					return (
						<GlassCard key={provider.id} className="flex flex-col gap-3 p-5">
							<div className="flex items-start justify-between gap-3">
								<div className="flex items-center gap-3">
									<span
										className={`flex h-9 w-9 items-center justify-center rounded-xl ${
											COLORED_BRAND_ICON_KEYS.has(provider.iconKey) ? 'border border-mc-line bg-white' : 'text-white'
										}`}
										style={COLORED_BRAND_ICON_KEYS.has(provider.iconKey) ? undefined : { backgroundColor: provider.brandColor ?? '#5f6368' }}
									>
										<ProviderBrandIcon iconKey={provider.iconKey} size={18} />
									</span>
									<div>
										<div className="flex items-center gap-2 text-[14px] font-semibold text-mc-text">
											{provider.displayName}
											<span className="rounded-full bg-mc-raised px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-mc-text-3">
												{provider.category}
											</span>
										</div>
										<p className="mt-0.5 text-[12.5px] text-mc-text-3">{provider.summary}</p>
									</div>
								</div>
								{integration && <HealthPill health={integration.health} />}
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
									<div className="flex flex-wrap items-center gap-2">
										{connected && provider.capabilities.resourcePicker && provider.category === 'code' && (
											<Button variant="mesh" size="sm" onClick={() => setPicker({ integration, provider })}>
												<FolderGit2 size={14} className="mr-1.5" /> Select repositories
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
										<Button variant="glass" size="sm" className="text-mc-danger" onClick={() => setDisconnecting(integration)}>
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
										<Button
											variant="glass"
											size="sm"
											className="w-fit"
											onClick={() => setByoaFor({ provider: provider.id, providerName: provider.displayName })}
										>
											<Building2 size={14} className="mr-1.5" /> Use own app
										</Button>
									)}
								</div>
							) : (
								<Button
									variant="mesh"
									size="sm"
									className="w-fit"
									disabled={busyProvider === provider.id}
									onClick={() => void beginConnect(provider)}
								>
									Connect {provider.displayName}
								</Button>
							)}
						</GlassCard>
					);
				})}
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

			{picker && (
				<ResourcePickerDialog
					integration={picker.integration}
					provider={picker.provider}
					projectId={project.id}
					onClose={() => setPicker(null)}
					onConnected={refresh}
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

/** Repository picker: the grant's live resource list with already-connected flags. */
function ResourcePickerDialog({
	integration,
	provider,
	projectId,
	onClose,
	onConnected,
}: {
	integration: Integration;
	provider: ProviderCatalogEntry;
	projectId: string;
	onClose: () => void;
	onConnected: () => void;
}) {
	const resources = useAsync<IntegrationResource[]>();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [connecting, setConnecting] = useState(false);

	useEffect(() => {
		resources.run(() => api.listIntegrationResources(integration.id).then((r) => r.resources));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [integration.id]);

	async function connectSelected() {
		setConnecting(true);
		let connected = 0;
		try {
			for (const resourceId of selected) {
				await api.connectRepoFromIntegration(projectId, integration.id, resourceId);
				connected += 1;
			}
			toast.success(`${connected} repositor${connected === 1 ? 'y' : 'ies'} connected — ingestion started`);
			onConnected();
			onClose();
		} catch (err) {
			toast.error((err as Error).message);
			if (connected > 0) onConnected();
			setConnecting(false);
		}
	}

	const rows = resources.state.status === 'success' ? resources.state.value : [];

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Select repositories · {integration.externalAccountName}</DialogTitle>
					<DialogDescription>
						Everything the {provider.displayName} installation can reach. Grant more repositories via Reconnect — Meshify picks up changes
						automatically.
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-72 space-y-1 overflow-y-auto pr-1">
					{resources.state.status === 'pending' && <p className="py-4 text-center text-[12.5px] text-mc-text-3">Loading repositories…</p>}
					{resources.state.status === 'error' && <p className="py-4 text-center text-[12.5px] text-mc-danger">{resources.state.error.message}</p>}
					{resources.state.status === 'success' && rows.length === 0 && (
						<p className="py-4 text-center text-[12.5px] text-mc-text-3">The installation has no repositories — grant access on {provider.displayName} first.</p>
					)}
					{rows.map((resource) => (
						<label
							key={resource.id}
							className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${resource.connected ? 'opacity-55' : 'hover:bg-mc-raised'}`}
						>
							<input
								type="checkbox"
								disabled={resource.connected}
								checked={resource.connected || selected.has(resource.id)}
								onChange={(e) => {
									const next = new Set(selected);
									if (e.target.checked) next.add(resource.id);
									else next.delete(resource.id);
									setSelected(next);
								}}
							/>
							<span className="flex-1 truncate text-mc-text-2">{resource.name}</span>
							{resource.private && <Lock size={12} className="text-mc-text-3" />}
							{resource.connected && <span className="text-[11px] text-mc-text-3">connected</span>}
						</label>
					))}
				</div>
				<DialogFooter>
					<Button variant="glass" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="mesh" disabled={selected.size === 0 || connecting} onClick={() => void connectSelected()}>
						{connecting ? 'Connecting…' : `Connect ${selected.size || ''}`.trim()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
