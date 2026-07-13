import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/api-client';
import type { Job, UploadResult } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { FileUpload } from '@/components/ui/file-upload';
import { GlassCard, Kicker, StatusDot } from '@/components/mc/primitives';
import { cn } from '@/lib/utils';

const TERMINAL = new Set(['completed', 'failed', 'dead_letter']);

const JOB_STATUS: Record<string, { dot: 'success' | 'indexing' | 'muted' | 'danger'; label: string }> = {
	queued: { dot: 'muted', label: 'Queued' },
	running: { dot: 'indexing', label: 'Running' },
	completed: { dot: 'success', label: 'Completed' },
	failed: { dot: 'danger', label: 'Failed' },
	dead_letter: { dot: 'danger', label: 'Dead letter' },
};

/**
 * Documents (design's ingestion surface): drag-and-drop upload wired to the
 * real multipart /documents endpoint, then live-polls the returned job via
 * /jobs/:id until it reaches a terminal state — no invented "indexing %".
 */
export function DocumentsPage() {
	const { project } = useWorkspace();
	const upload = useAsync<UploadResult>();
	const [job, setJob] = useState<Job | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPolling = useCallback(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
	}, []);

	// Poll the active job until it settles.
	useEffect(() => {
		if (!jobId) return;
		let cancelled = false;
		const tick = async () => {
			try {
				const j = await api.getJob(jobId);
				if (cancelled) return;
				setJob(j);
				if (TERMINAL.has(j.status)) stopPolling();
			} catch {
				stopPolling();
			}
		};
		void tick();
		pollRef.current = setInterval(tick, 2500);
		return () => {
			cancelled = true;
			stopPolling();
		};
	}, [jobId, stopPolling]);

	const handleFiles = (files: File[]) => {
		const file = files[0];
		if (!file) return;
		setJob(null);
		setJobId(null);
		void upload.run(async () => {
			const res = await api.uploadDocument(project.id, file);
			if (res.jobId) setJobId(res.jobId);
			return res;
		});
	};

	const uploaded = upload.state.status === 'success' ? upload.state.value : null;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<Kicker>// KNOWLEDGE INGESTION</Kicker>
				<p className="text-sm text-mc-text-3">
					Upload documents to index into {project.name}. Files land in object storage and a worker embeds them into the project's vector store.
				</p>
			</div>

			<FileUpload
				onChange={handleFiles}
				accept=".pdf,.docx,.pptx,.txt,.md"
				disabled={upload.state.status === 'pending'}
				className="border-white/[.12] bg-[rgba(18,18,24,.4)]"
			/>

			{upload.state.status === 'pending' && (
				<div className="flex items-center gap-2 text-sm text-mc-text-3">
					<Loader2 className="h-4 w-4 animate-spin" /> Uploading…
				</div>
			)}
			{upload.state.status === 'error' && (
				<div className="rounded-lg border border-mc-danger/40 bg-mc-danger/10 px-4 py-3 text-sm text-mc-danger">{upload.state.error.message}</div>
			)}

			{uploaded && (
				<GlassCard className="flex flex-col gap-4 p-5">
					<div className="flex items-center gap-2.5">
						{uploaded.deduped ? (
							<CheckCircle2 className="h-4 w-4 text-mc-success" />
						) : (
							<StatusDot color={job ? JOB_STATUS[job.status]?.dot ?? 'muted' : 'indexing'} glow pulse={!job || !TERMINAL.has(job.status)} />
						)}
						<span className="text-sm font-medium text-mc-text">
							{uploaded.deduped ? 'Already ingested (content-hash match) — no new job.' : 'Uploaded — ingestion job enqueued.'}
						</span>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<InfoRow label="Document ID" value={uploaded.documentId} />
						<InfoRow label="Upload status" value={uploaded.status} />
						{job && (
							<>
								<InfoRow label="Job" value={job.id} />
								<InfoRow label="Job status" value={JOB_STATUS[job.status]?.label ?? job.status} dot={JOB_STATUS[job.status]?.dot} />
								<InfoRow label="Attempts" value={String(job.attempts)} />
								{job.completedAt && <InfoRow label="Completed" value={new Date(job.completedAt).toLocaleString()} />}
							</>
						)}
					</div>
					{job?.lastError && (
						<div className="flex items-start gap-2 rounded-lg border border-mc-danger/30 bg-mc-danger/10 p-3">
							<XCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-mc-danger" />
							<span className="font-mono text-[11px] leading-relaxed text-mc-danger">{job.lastError}</span>
						</div>
					)}
					{job && !TERMINAL.has(job.status) && <p className="font-mono text-[11px] text-mc-muted">Polling job status…</p>}
				</GlassCard>
			)}
		</div>
	);
}

function InfoRow({ label, value, dot }: { label: string; value: string; dot?: 'success' | 'indexing' | 'muted' | 'danger' }) {
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-white/[.06] bg-white/[.02] px-3 py-2.5">
			<span className="font-mono text-[10px] tracking-[0.08em] text-mc-muted-2">{label.toUpperCase()}</span>
			<span className={cn('flex items-center gap-1.5 truncate font-mono text-xs text-mc-text')}>
				{dot && <StatusDot color={dot} />}
				{value}
			</span>
		</div>
	);
}
