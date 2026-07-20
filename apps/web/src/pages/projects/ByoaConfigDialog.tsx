import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ShieldCheck, CheckCircle2, Trash2 } from 'lucide-react';
import { api } from '@/api-client';
import type { ByoaFieldView } from '@/api';
import { useAsync } from '@/ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Enterprise Bring-Your-Own-App configuration. Registration is org-scoped and
 * keyed only by `provider`, so this works both to override a connected
 * integration's app AND to bootstrap a provider that has no managed app on the
 * deployment (no integration exists yet). The form is provider-declared
 * (ByoaCapable.describeByoaConfig) so this component holds no provider
 * knowledge. Secrets are write-only — the server reports only whether each is
 * set; a blank field on save keeps the stored value. Saving returns the
 * per-registration webhook URL the org's app must target.
 */
export function ByoaConfigDialog({
	provider,
	providerName,
	accountName,
	onClose,
	onSaved,
}: {
	provider: string;
	providerName: string;
	accountName?: string;
	onClose: () => void;
	onSaved: () => void;
}) {
	const config = useAsync<{ mode: string; fields: ByoaFieldView[] }>();
	const [values, setValues] = useState<Record<string, string>>({});
	const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [confirmRemove, setConfirmRemove] = useState(false);

	useEffect(() => {
		config.run(() => api.describeRegistration(provider));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [provider]);

	async function save() {
		setSaving(true);
		try {
			const { webhookPath } = await api.configureRegistration(provider, values);
			setWebhookUrl(`${window.location.origin}/api${webhookPath}`);
			toast.success(`Your ${providerName} app is registered`);
			onSaved();
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
			await api.deleteRegistration(provider);
			toast.success(`${providerName} app removed — future connects use the managed app`);
			onSaved();
			onClose();
		} catch (err) {
			toast.error((err as Error).message);
			setConfirmRemove(false);
		} finally {
			setRemoving(false);
		}
	}

	const loaded = config.state.status === 'success';
	const fields: ByoaFieldView[] = config.state.status === 'success' ? config.state.value.fields : [];
	const isByoa = config.state.status === 'success' && config.state.value.mode === 'byoa';

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="grid max-h-[88vh] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto]">
				<DialogHeader>
					<DialogTitle>
						Bring your own {providerName} app{accountName ? ` · ${accountName}` : ''}
					</DialogTitle>
					<DialogDescription>
						Use your organization's own provider app instead of Meshify's managed one. Credentials are encrypted at rest and never shown again.
						Leave a secret blank to keep the stored value.
					</DialogDescription>
				</DialogHeader>

				{/* Scrolls independently so the dialog never overflows the viewport. */}
				<div className="-mr-2 min-h-0 overflow-y-auto pr-2">
					{webhookUrl ? (
						<div className="space-y-4 py-1">
							<div className="flex items-start gap-2.5 rounded-lg bg-mc-success/10 px-3 py-3">
								<CheckCircle2 className="mt-0.5 shrink-0 text-mc-success" size={18} />
								<div className="text-[12.5px] text-mc-text-2">
									<p className="font-medium text-mc-text">Your {providerName} app is registered.</p>
									<p className="mt-0.5">Its credentials are encrypted in your organization's vault.</p>
								</div>
							</div>
							<div>
								<p className="text-[12px] font-medium text-mc-text-2">1 · Point your app's webhook at this URL</p>
								<div className="mt-1.5 flex items-center gap-2">
									<code className="flex-1 break-all rounded bg-mc-raised px-2 py-1.5 text-[11.5px] text-mc-text-2">{webhookUrl}</code>
									<button
										onClick={() => {
											void navigator.clipboard.writeText(webhookUrl);
											toast.success('Copied');
										}}
										className="shrink-0 text-mc-text-3 hover:text-mc-text"
										aria-label="Copy webhook URL"
									>
										<Copy size={14} />
									</button>
								</div>
								<p className="mt-1.5 text-[11px] leading-relaxed text-mc-text-3">
									Testing locally? An external provider (e.g. GitHub) can't reach <code>localhost</code> — expose the API with a tunnel and use{' '}
									<code>https://&lt;your-tunnel&gt;/v1/integrations/webhooks/{provider}/…</code> (the same path, without the <code>/api</code> prefix).
								</p>
							</div>
							<p className="text-[12.5px] text-mc-text-2">
								2 · Close this dialog and click <span className="font-medium text-mc-text">Connect {providerName}</span> to install the app.
							</p>
						</div>
					) : (
						<div className="space-y-3">
							{config.state.status === 'error' && <p className="text-[12.5px] text-mc-danger">{config.state.error.message}</p>}
							{fields.map((field) => (
								<label key={field.key} className="block">
									<span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-mc-text-2">
										{field.label}
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
								</label>
							))}
						</div>
					)}
				</div>

				<DialogFooter className="sm:items-center">
					{webhookUrl ? (
						<Button variant="mesh" onClick={onClose}>
							Done
						</Button>
					) : (
						<>
							{isByoa && (
								<Button
									variant="glass"
									size="sm"
									className="text-mc-danger sm:mr-auto"
									disabled={removing}
									onClick={() => void remove()}
								>
									<Trash2 size={14} className="mr-1.5" />
									{removing ? 'Removing…' : confirmRemove ? 'Click again to remove' : 'Remove app'}
								</Button>
							)}
							<Button variant="glass" onClick={onClose}>
								Close
							</Button>
							<Button variant="mesh" disabled={saving || !loaded} onClick={() => void save()}>
								{saving ? 'Saving…' : 'Save credentials'}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
