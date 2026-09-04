import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { api } from '@/api-client';
import type { LlmProviderCatalogEntry, LlmProviderStatus } from '@/api';
import { useAsync, EMPTY } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { GlassCard, Kicker, StatusDot, type DotColor } from '@/components/mc/primitives';
import { Button } from '@/components/ui/button';
import { MultiStepLoader } from '@/components/ui/multi-step-loader';
import { ProviderBrandIcon } from '@/components/ProviderBrandIcon';
import { LlmProviderDialog } from './LlmProviderDialog';

/** Steps shown while the backend activates the provider and builds its RocketRide pipeline. */
const ACTIVATE_STEPS = [
	{ text: 'Validating provider credentials' },
	{ text: 'Securing your API key in the vault' },
	{ text: 'Activating the provider' },
	{ text: 'Building the RocketRide pipeline' },
	{ text: 'Warming up the model connection' },
	{ text: 'Almost ready' },
];

const STATUS_VIEW: Record<LlmProviderStatus, { label: string; color: DotColor }> = {
	connected: { label: 'Connected', color: 'success' },
	error: { label: 'Error', color: 'danger' },
	disconnected: { label: 'Disconnected', color: 'muted' },
	not_connected: { label: 'Not connected', color: 'muted' },
};

/** OpenAI ships a monochrome mark (currentColor); the rest get a brand-tinted chip. */
function iconChip(provider: LlmProviderCatalogEntry): { className: string; style?: CSSProperties } {
	const base = 'flex h-9 w-9 flex-none items-center justify-center rounded-xl';
	if (provider.iconKey === 'openai') return { className: `${base} border border-mc-border bg-mc-text/[.05] text-mc-text` };
	const color = provider.brandColor ?? '#6366F1';
	return { className: `${base} border`, style: { color, backgroundColor: `${color}1A`, borderColor: `${color}33` } };
}

/**
 * "AI Models" — the AI Providers category of the Integrations surface. Cards
 * mirror the knowledge-source integration cards but drive the LLM subsystem:
 * connect a provider, store its key in the vault, pick a default model, test the
 * connection, and activate exactly one. The active provider powers every
 * RocketRide pipeline automatically.
 */
export function AiModelsSection() {
	const { project } = useWorkspace();
	const catalog = useAsync<LlmProviderCatalogEntry[]>();
	const [manageProvider, setManageProvider] = useState<string | null>(null);
	const [activating, setActivating] = useState<string | null>(null);

	const refresh = useCallback(() => {
		void catalog.run(() => api.listLlmProviders());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	/**
	 * Activate a provider. The multi-step loader is shown for the whole call:
	 * the backend builds this project's RocketRide pipeline synchronously (via
	 * `projectId`), so the loader stays until the pipeline is ready and the user
	 * never chats mid-build.
	 */
	async function activate(providerId: string, displayName?: string) {
		const name = displayName ?? providerId;
		setActivating(providerId);
		try {
			const { ready } = await api.activateLlmProvider(providerId, project.id);
			toast.success(ready ? `${name} is now the active model provider` : `${name} activated — its pipeline is still warming up`);
			setManageProvider(null);
			refresh();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setActivating(null);
		}
	}

	const providers = catalog.data ?? EMPTY;

	const renderCard = (provider: LlmProviderCatalogEntry) => {
		const status = STATUS_VIEW[provider.status] ?? STATUS_VIEW.not_connected;
		const chip = iconChip(provider);
		return (
			<GlassCard key={provider.id} className="flex flex-col gap-4 p-5">
				<div className="flex items-start justify-between gap-4">
					<div className="flex min-w-0 items-start gap-3">
						<span className={chip.className} style={chip.style}>
							<ProviderBrandIcon iconKey={provider.iconKey} size={18} />
						</span>
						<div className="min-w-0">
							<div className="flex items-center gap-2 text-[14px] font-semibold text-mc-text">
								{provider.displayName}
								{provider.active && (
									<span className="inline-flex items-center gap-1 rounded-full bg-mc-purple/15 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-mc-purple">
										<Zap size={10} /> Active
									</span>
								)}
							</div>
							<p className="mt-1 text-[12.5px] leading-relaxed text-mc-text-3">{provider.summary}</p>
						</div>
					</div>
					{provider.configured && (
						<span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-mc-raised px-2.5 py-1 text-[11.5px] font-medium text-mc-text-2">
							<StatusDot color={status.color} glow={provider.status === 'connected'} />
							{status.label}
						</span>
					)}
				</div>

				{provider.configured ? (
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-[12.5px] text-mc-text-2">
							<span className="text-mc-text-3">Default model</span>
							<span className="font-medium">{provider.defaultModel ?? '—'}</span>
						</div>
						{provider.lastError && <p className="text-[12px] text-mc-danger">{provider.lastError}</p>}
						<div className="flex flex-wrap items-center gap-2 pt-0.5">
							{!provider.active && (
								<Button variant="meshAi" size="sm" disabled={activating !== null} onClick={() => void activate(provider.id, provider.displayName)}>
									<Zap size={14} className="mr-1.5" /> Set active
								</Button>
							)}
							<Button variant="glass" size="sm" onClick={() => setManageProvider(provider.id)}>
								Manage
							</Button>
						</div>
					</div>
				) : (
					<Button variant="meshAi" size="sm" className="w-fit" onClick={() => setManageProvider(provider.id)}>
						Connect {provider.displayName}
					</Button>
				)}
			</GlassCard>
		);
	};

	return (
		<section>
			<div className="flex items-center gap-2 border-b border-mc-hairline pb-2.5">
				<Kicker className="text-mc-text-3">AI Models</Kicker>
				<span className="rounded-full bg-mc-surface px-2 py-0.5 font-mono text-micro text-mc-text-3">{providers.length}</span>
			</div>
			<p className="mt-3 text-[12.5px] text-mc-text-3">
				Choose which LLM powers your knowledge graph. Connect a provider, store its key securely, and activate one — every pipeline uses it automatically,
				with no workflow changes.
			</p>

			{catalog.state.status === 'error' && <p className="mt-3 text-sm text-mc-danger">{catalog.state.error.message}</p>}

			<div className="mt-4 grid gap-4 sm:grid-cols-2">{providers.map(renderCard)}</div>

			{manageProvider && (
				<LlmProviderDialog
					provider={manageProvider}
					onClose={() => setManageProvider(null)}
					onSaved={refresh}
					onActivate={(providerId, displayName) => void activate(providerId, displayName)}
				/>
			)}

			{/* Full-screen multi-step loader while a provider is activated + its pipeline builds. */}
			<MultiStepLoader loadingStates={ACTIVATE_STEPS} loading={activating !== null} duration={2200} />
		</section>
	);
}
