import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ShieldCheck } from 'lucide-react';
import { api } from '@/api-client';
import type { ByoaFieldView, Integration } from '@/api';
import { useAsync } from '@/ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Enterprise Bring-Your-Own-App configuration. The form is provider-declared
 * (ByoaCapable.describeByoaConfig) so this component holds no provider
 * knowledge. Secrets are write-only — the server reports only whether each is
 * set; a blank field on save keeps the stored value. Saving returns the
 * per-integration webhook URL the org's app must target.
 */
export function ByoaConfigDialog({ integration, onClose, onSaved }: { integration: Integration; onClose: () => void; onSaved: () => void }) {
	const config = useAsync<{ mode: string; fields: ByoaFieldView[] }>();
	const [values, setValues] = useState<Record<string, string>>({});
	const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		config.run(() => api.describeRegistration(integration.provider));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [integration.provider]);

	async function save() {
		setSaving(true);
		try {
			const { webhookPath } = await api.configureRegistration(integration.provider, values);
			setWebhookUrl(`${window.location.origin}/api${webhookPath}`);
			toast.success('Enterprise app configured');
			onSaved();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setSaving(false);
		}
	}

	const fields = config.state.status === 'success' ? config.state.value.fields : [];

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Bring your own {integration.provider} app · {integration.externalAccountName}</DialogTitle>
					<DialogDescription>
						Use your organization's own provider app instead of Meshify's managed one. Credentials are encrypted at rest and never shown again.
						Leave a secret blank to keep the stored value.
					</DialogDescription>
				</DialogHeader>

				{config.state.status === 'error' && <p className="text-[12.5px] text-mc-danger">{config.state.error.message}</p>}

				<div className="space-y-3">
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
									placeholder={field.configured ? '•••••••• (leave blank to keep)' : field.placeholder}
									className="w-full rounded-lg border border-mc-line bg-mc-surface px-3 py-2 font-mono text-[12px] text-mc-text"
									onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
								/>
							) : (
								<input
									type={field.secret ? 'password' : 'text'}
									placeholder={field.secret && field.configured ? '•••••••• (leave blank to keep)' : field.placeholder}
									className="w-full rounded-lg border border-mc-line bg-mc-surface px-3 py-2 text-[13px] text-mc-text"
									onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
								/>
							)}
						</label>
					))}
				</div>

				{webhookUrl && (
					<div className="rounded-lg bg-mc-raised px-3 py-2.5">
						<p className="text-[11.5px] font-medium text-mc-text-2">Point your app's webhook at:</p>
						<div className="mt-1 flex items-center gap-2">
							<code className="flex-1 truncate rounded bg-mc-surface px-2 py-1 text-[11.5px] text-mc-text-2">{webhookUrl}</code>
							<button
								onClick={() => {
									void navigator.clipboard.writeText(webhookUrl);
									toast.success('Copied');
								}}
								className="text-mc-text-3 hover:text-mc-text"
							>
								<Copy size={14} />
							</button>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button variant="glass" onClick={onClose}>
						Close
					</Button>
					<Button variant="mesh" disabled={saving || config.state.status !== 'success'} onClick={() => void save()}>
						{saving ? 'Saving…' : 'Save credentials'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
