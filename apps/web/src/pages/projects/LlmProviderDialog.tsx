import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ShieldCheck, Trash2, Zap, Loader2, XCircle } from 'lucide-react';
import { api } from '@/api-client';
import type { LlmModel, LlmProviderDetail, LlmTestResult } from '@/api';
import { useAsync } from '@/ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Connect / manage dialog for a single AI provider. Provider-declared credential
 * fields (secrets write-only), default-model selection, live Test Connection,
 * Activate, and Disconnect. Holds no provider knowledge — everything is driven by
 * the provider's manifest fetched from the backend. Mirrors ByoaConfigDialog.
 */
export function LlmProviderDialog({
	provider,
	onClose,
	onSaved,
	onActivate,
}: {
	provider: string;
	onClose: () => void;
	onSaved: () => void;
	/** Delegated to the section, which shows the multi-step loader and closes this dialog once the pipeline is built. */
	onActivate: (providerId: string, displayName?: string) => void;
}) {
	const detail = useAsync<LlmProviderDetail>();
	const [values, setValues] = useState<Record<string, string>>({});
	const [selectedModel, setSelectedModel] = useState('');
	const [customModel, setCustomModel] = useState('');
	const [models, setModels] = useState<LlmModel[]>([]);
	const [test, setTest] = useState<LlmTestResult | null>(null);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [confirmRemove, setConfirmRemove] = useState(false);

	useEffect(() => {
		void detail.run(() => api.getLlmProvider(provider)).then((d) => {
			if (!d) return;
			setModels(d.models);
			setSelectedModel(d.defaultModel ?? d.models.find((m) => m.recommended)?.id ?? d.models[0]?.id ?? '');
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [provider]);

	const d = detail.data ?? null;
	const effectiveModel = customModel.trim() || selectedModel;

	const modelOptions = useMemo(() => {
		// Ensure the currently-selected model is always an option, even if it's custom or not in the fetched list.
		if (selectedModel && !models.some((m) => m.id === selectedModel)) {
			return [{ id: selectedModel, label: selectedModel, contextTokens: 0, recommended: false }, ...models];
		}
		return models;
	}, [models, selectedModel]);

	async function refreshModels() {
		try {
			const { models: fetched } = await api.listLlmModels(provider);
			setModels(fetched);
			toast.success(`${fetched.length} model${fetched.length === 1 ? '' : 's'} available`);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function runTest() {
		setTesting(true);
		setTest(null);
		try {
			const result = await api.testLlmProvider(provider, { values, model: effectiveModel || undefined });
			setTest(result);
			if (result.ok && result.models?.length) setModels(result.models);
		} catch (err) {
			setTest({ ok: false, error: (err as Error).message });
		} finally {
			setTesting(false);
		}
	}

	async function save() {
		setSaving(true);
		try {
			await api.connectLlmProvider(provider, values, effectiveModel || undefined);
			toast.success(`${d?.displayName ?? provider} saved`);
			onSaved();
			await detail.run(() => api.getLlmProvider(provider));
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setSaving(false);
		}
	}

	async function remove() {
		if (!confirmRemove) {
			setConfirmRemove(true);
			return;
		}
		setRemoving(true);
		try {
			await api.disconnectLlmProvider(provider);
			toast.success(`${d?.displayName ?? provider} disconnected`);
			onSaved();
			onClose();
		} catch (err) {
			toast.error((err as Error).message);
			setConfirmRemove(false);
		} finally {
			setRemoving(false);
		}
	}

	const fields = d?.fields ?? [];

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="grid max-h-[88vh] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto]">
				<DialogHeader>
					<DialogTitle>{d ? `Configure ${d.displayName}` : 'Configure provider'}</DialogTitle>
					<DialogDescription>
						{d?.summary} Credentials are encrypted at rest and never shown again — leave a secret blank to keep the stored value.
					</DialogDescription>
				</DialogHeader>

				<div className="-mr-2 min-h-0 space-y-3 overflow-y-auto pr-2">
					{detail.state.status === 'error' && <p className="text-[12.5px] text-mc-danger">{detail.state.error.message}</p>}

					{fields.map((field) => (
						<label key={field.key} className="block">
							<span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-mc-text-2">
								{field.label}
								{field.optional && <span className="text-[11px] font-normal text-mc-text-3">optional</span>}
								{field.secret && field.configured && (
									<span className="inline-flex items-center gap-1 text-[11px] font-normal text-mc-success">
										<ShieldCheck size={12} /> stored
									</span>
								)}
							</span>
							{field.multiline ? (
								<textarea
									rows={4}
									spellCheck={false}
									autoCapitalize="off"
									autoCorrect="off"
									placeholder={field.configured ? '•••••••• (leave blank to keep)' : field.placeholder}
									className="w-full resize-y rounded-lg border border-mc-border bg-mc-surface px-3 py-2 font-mono text-[12px] text-mc-text"
									onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
								/>
							) : (
								<input
									type={field.secret ? 'password' : 'text'}
									spellCheck={false}
									autoComplete="off"
									autoCapitalize="off"
									autoCorrect="off"
									placeholder={field.secret && field.configured ? '•••••••• (leave blank to keep)' : field.placeholder}
									className="w-full rounded-lg border border-mc-border bg-mc-surface px-3 py-2 text-[13px] text-mc-text"
									onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
								/>
							)}
							{field.hint && <span className="mt-1 block text-[11px] text-mc-text-3">{field.hint}</span>}
						</label>
					))}

					{/* Default model selection */}
					<div>
						<span className="mb-1 flex items-center justify-between text-[12.5px] font-medium text-mc-text-2">
							Default model
							{d?.modelSource === 'dynamic' && (
								<button type="button" onClick={() => void refreshModels()} className="text-[11px] font-normal text-mc-accent hover:underline">
									Refresh models
								</button>
							)}
						</span>
						{modelOptions.length > 0 && (
							<select
								value={customModel ? '' : selectedModel}
								onChange={(e) => {
									setSelectedModel(e.target.value);
									setCustomModel('');
								}}
								className="w-full rounded-lg border border-mc-border bg-mc-surface px-3 py-2 text-[13px] text-mc-text"
							>
								{customModel && <option value="">Custom: {customModel}</option>}
								{modelOptions.map((model) => (
									<option key={model.id} value={model.id}>
										{model.label}
										{model.recommended ? ' · recommended' : ''}
									</option>
								))}
							</select>
						)}
						{d?.allowCustomModel && (
							<input
								type="text"
								spellCheck={false}
								value={customModel}
								placeholder="Or type a custom model id"
								className="mt-2 w-full rounded-lg border border-mc-border bg-mc-surface px-3 py-2 text-[13px] text-mc-text"
								onChange={(e) => setCustomModel(e.target.value)}
							/>
						)}
					</div>

					{/* Test result */}
					{test && (
						<div className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${test.ok ? 'bg-mc-success/10' : 'bg-mc-danger/10'}`}>
							{test.ok ? <CheckCircle2 className="mt-0.5 shrink-0 text-mc-success" size={16} /> : <XCircle className="mt-0.5 shrink-0 text-mc-danger" size={16} />}
							<div className="text-[12.5px] text-mc-text-2">
								{test.ok ? (
									<>
										<p className="font-medium text-mc-text">Connected</p>
										<p className="mt-0.5">
											{test.models?.length ? `${test.models.length} models available` : 'Credentials accepted'}
											{test.latencyMs != null ? ` · ${test.latencyMs} ms` : ''}
											{test.region ? ` · ${test.region}` : ''}
										</p>
									</>
								) : (
									<p className="text-mc-danger">{test.error ?? 'Connection failed'}</p>
								)}
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="sm:items-center">
					{d?.configured && (
						<Button variant="glass" size="sm" className="text-mc-danger sm:mr-auto" disabled={removing} onClick={() => void remove()}>
							<Trash2 size={14} className="mr-1.5" />
							{removing ? 'Removing…' : confirmRemove ? 'Click again' : 'Disconnect'}
						</Button>
					)}
					<Button variant="glass" disabled={testing} onClick={() => void runTest()}>
						{testing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
						{testing ? 'Testing…' : 'Test connection'}
					</Button>
					<Button variant="glass" disabled={saving || !d} onClick={() => void save()}>
						{saving ? 'Saving…' : 'Save'}
					</Button>
					{d?.configured && !d.active && (
						<Button variant="meshAi" onClick={() => onActivate(provider, d.displayName)}>
							<Zap size={14} className="mr-1.5" />
							Set active
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
