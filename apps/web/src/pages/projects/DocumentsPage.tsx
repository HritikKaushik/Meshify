import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Search, UploadCloud, Plus, LayoutGrid, List, Trash2, Loader2, FileText, FileCode2 } from 'lucide-react';
import { api } from '@/api-client';
import type { DocumentSummary } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { timeAgo } from '@/lib/time';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Status → badge treatment. Documents move pending → parsed → embedded (or failed).
const STATUS: Record<DocumentSummary['status'], { label: string; className: string; pulse?: boolean }> = {
	embedded: { label: 'INDEXED', className: 'text-mc-success bg-mc-success/[.09]' },
	parsed: { label: 'INDEXING', className: 'text-mc-accent bg-mc-accent/[.09]', pulse: true },
	pending: { label: 'INDEXING', className: 'text-mc-accent bg-mc-accent/[.09]', pulse: true },
	failed: { label: 'FAILED', className: 'text-mc-danger bg-mc-danger/[.09]' },
};

const FILTERS = ['All', 'Runbooks', 'ADRs', 'Specs', 'PDFs'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(doc: DocumentSummary, filter: Filter): boolean {
	const name = doc.filename.toLowerCase();
	switch (filter) {
		case 'All':
			return true;
		case 'Runbooks':
			return name.includes('runbook');
		case 'ADRs':
			return name.includes('adr');
		case 'Specs':
			return name.includes('spec');
		case 'PDFs':
			return doc.sourceType === 'pdf';
	}
}

// Preview tint + icon per source type — the calm faux-preview at the top of each card.
function previewStyle(type: DocumentSummary['sourceType']): { grad: string; icon: typeof FileText; tint: string; color: string } {
	if (type === 'pdf') return { grad: 'linear-gradient(180deg,#FFF7F0,#FBF2E8)', icon: FileText, tint: 'rgba(229,72,77,.1)', color: '#E5484D' };
	if (type === 'docx' || type === 'pptx') return { grad: 'linear-gradient(180deg,#F5F4FF,#EEEDFB)', icon: FileText, tint: 'rgba(99,102,241,.1)', color: '#6366F1' };
	return { grad: 'linear-gradient(180deg,#FBFCFE,#F4F6FA)', icon: FileCode2, tint: 'rgba(30,158,106,.1)', color: '#1E9E6A' };
}

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md';
const IN_PROGRESS = new Set<DocumentSummary['status']>(['pending', 'parsed']);

/**
 * Documents (design 4e) — a Google-Drive-inspired view of a project's ingested
 * knowledge base: a floating upload band, type filters, and a calm grid/list of
 * documents with live indexing state and a remove action. Backed by the real
 * documents API (list/upload/delete); the list live-polls while anything is
 * still indexing rather than inventing progress.
 */
export function DocumentsPage() {
	const { project } = useWorkspace();
	const list = useAsync<DocumentSummary[]>();
	const upload = useAsync<unknown>();
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState<Filter>('All');
	const [view, setView] = useState<'grid' | 'list'>('grid');
	const [dragActive, setDragActive] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null);
	const [deleting, setDeleting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const refresh = useCallback(() => list.run(() => api.listDocuments(project.id)), [list, project.id]);

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project.id]);

	const docs = list.state.status === 'success' ? list.state.value : [];
	const anyInProgress = docs.some((d) => IN_PROGRESS.has(d.status));

	// Poll while anything is still indexing so the badges settle without a manual refresh.
	useEffect(() => {
		if (!anyInProgress) return;
		const id = setInterval(() => void refresh(), 3000);
		return () => clearInterval(id);
	}, [anyInProgress, refresh]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return docs.filter((d) => matchesFilter(d, filter) && (!q || d.filename.toLowerCase().includes(q)));
	}, [docs, filter, query]);

	const indexed = docs.filter((d) => d.status === 'embedded').length;
	const processing = docs.filter((d) => IN_PROGRESS.has(d.status)).length;

	const handleFiles = (files: FileList | File[] | null) => {
		const file = files && files[0];
		if (!file) return;
		void upload.run(async () => {
			const res = await api.uploadDocument(project.id, file);
			toast.success(res.deduped ? 'Already ingested — no new job.' : `Uploading “${file.name}” — indexing started.`);
			await refresh();
			return res;
		});
	};

	const onDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragActive(false);
		handleFiles(e.dataTransfer.files);
	};

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		setDeleting(true);
		try {
			await api.deleteDocument(project.id, pendingDelete.id);
			toast.success(`Removed “${pendingDelete.filename}”`);
			setPendingDelete(null);
			await refresh();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className="flex flex-col gap-5">
			<input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => handleFiles(e.target.files)} />

			{/* Header */}
			<div className="flex flex-wrap items-center gap-4">
				<div>
					<h1 className="text-[28px] font-semibold leading-tight tracking-[-.03em] text-mc-text">Documents</h1>
					<div className="mt-1 text-[12.5px] text-mc-muted">
						{list.state.status === 'pending' && docs.length === 0
							? 'Loading…'
							: `${docs.length} document${docs.length === 1 ? '' : 's'} · ${indexed} indexed · ${processing} processing`}
					</div>
				</div>
				<div className="flex-1" />
				<div className="flex min-w-[220px] items-center gap-2.5 rounded-xl border border-black/[.08] bg-white px-3 py-2 text-mc-muted-2 shadow-[0_1px_3px_rgba(16,24,40,.04)]">
					<Search className="h-3.5 w-3.5" />
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search documents"
						className="w-full bg-transparent text-[12.5px] text-mc-text placeholder:text-mc-muted focus:outline-none"
					/>
				</div>
				<div className="flex items-center gap-0.5 rounded-xl bg-mc-raised p-[3px]">
					<ViewToggle active={view === 'grid'} onClick={() => setView('grid')} icon={LayoutGrid} label="Grid" />
					<ViewToggle active={view === 'list'} onClick={() => setView('list')} icon={List} label="List" />
				</div>
			</div>

			{/* Floating upload band */}
			<div
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragActive(true);
				}}
				onDragLeave={() => setDragActive(false)}
				onDrop={onDrop}
				className={cn(
					'flex cursor-pointer items-center gap-4 rounded-2xl border-[1.5px] border-dashed bg-white px-6 py-5 shadow-[0_8px_26px_rgba(26,115,232,.07)] transition-colors',
					dragActive ? 'border-mc-accent bg-mc-accent/[.04]' : 'border-mc-accent/30'
				)}
			>
				<div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] text-white shadow-[0_8px_20px_rgba(79,110,240,.28)]" style={{ background: 'linear-gradient(135deg,#4F8DFB,#6366F1)' }}>
					{upload.state.status === 'pending' ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
				</div>
				<div className="flex-1">
					<div className="text-[15px] font-semibold text-mc-text">Drop files to add them to the knowledge base</div>
					<div className="mt-0.5 text-[12.5px] text-mc-muted">PDF, Markdown, DOCX, PPTX, TXT · Mesh indexes automatically</div>
				</div>
				<Button variant="mesh" size="sm" className="px-4" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
					Browse files
				</Button>
			</div>
			{upload.state.status === 'error' && (
				<div className="rounded-xl border border-mc-danger/30 bg-mc-danger/[.07] px-4 py-3 text-sm text-mc-danger">{(upload.state.error as Error).message}</div>
			)}

			{/* Filters */}
			<div className="flex items-center gap-2.5">
				{FILTERS.map((f) => (
					<button
						key={f}
						onClick={() => setFilter(f)}
						className={cn(
							'rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors',
							filter === f
								? 'bg-mc-accent text-white shadow-[0_4px_12px_rgba(26,115,232,.2)]'
								: 'border border-black/[.08] bg-white text-mc-text-3 hover:text-mc-text'
						)}
					>
						{f}
					</button>
				))}
				<div className="flex-1" />
				<span className="text-[12px] text-mc-muted">Sorted by recently updated</span>
			</div>

			{/* Empty / content */}
			{list.state.status === 'success' && docs.length === 0 ? (
				<div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/[.14] bg-white py-16 text-center">
					<UploadCloud className="h-6 w-6 text-mc-muted-2" />
					<p className="text-sm text-mc-text-3">No documents yet. Drop a file above to start building this project's knowledge base.</p>
				</div>
			) : view === 'grid' ? (
				<div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{filtered.map((doc) => (
						<DocumentCard key={doc.id} doc={doc} onDelete={() => setPendingDelete(doc)} />
					))}
					<button
						onClick={() => inputRef.current?.click()}
						className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/[.14] bg-white text-mc-muted-2 transition-colors hover:border-mc-accent/40 hover:text-mc-accent"
					>
						<span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-mc-surface text-mc-muted"><Plus className="h-4 w-4" /></span>
						<span className="text-[12px] font-medium">Add document</span>
					</button>
				</div>
			) : (
				<div className="overflow-hidden rounded-2xl border border-black/[.06] bg-white shadow-[0_10px_30px_rgba(16,24,40,.05)]">
					{filtered.map((doc, i) => (
						<DocumentRow key={doc.id} doc={doc} divider={i > 0} onDelete={() => setPendingDelete(doc)} />
					))}
				</div>
			)}

			{/* Delete confirm */}
			<Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
				<DialogContent className="border-black/[.08] bg-white">
					<DialogHeader>
						<DialogTitle>Remove “{pendingDelete?.filename}”?</DialogTitle>
						<DialogDescription>
							This deletes the document, its raw upload, and its embedded chunks from this project's knowledge base. Mesh will stop citing it. This can't be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="glass" onClick={() => setPendingDelete(null)} disabled={deleting}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
							{deleting ? 'Removing…' : 'Remove document'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function ViewToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof LayoutGrid; label: string }) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors',
				active ? 'bg-white text-mc-accent-lo shadow-[0_1px_2px_rgba(16,24,40,.08)]' : 'text-mc-text-3 hover:text-mc-text'
			)}
		>
			<Icon className="h-3.5 w-3.5" /> {label}
		</button>
	);
}

function StatusBadge({ status }: { status: DocumentSummary['status'] }) {
	const s = STATUS[status];
	return (
		<span className={cn('flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[9px] font-medium', s.className)}>
			{s.pulse && <span className="h-1 w-1 animate-meshpulse rounded-full bg-current" />}
			{s.label}
		</span>
	);
}

function DocumentCard({ doc, onDelete }: { doc: DocumentSummary; onDelete: () => void }) {
	const { grad, icon: Icon, tint, color } = previewStyle(doc.sourceType);
	return (
		<div className="group relative flex flex-col overflow-hidden rounded-2xl border border-black/[.05] bg-white shadow-[0_6px_20px_rgba(16,24,40,.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(16,24,40,.1)]">
			{/* faux preview */}
			<div className="relative h-[132px] overflow-hidden px-[18px] pt-[18px]" style={{ background: grad }}>
				<div className="h-[6px] w-[60%] rounded-sm bg-black/[.1]" />
				<div className="mt-2.5 h-[5px] w-[88%] rounded-sm bg-black/[.06]" />
				<div className="mt-1.5 h-[5px] w-[80%] rounded-sm bg-black/[.06]" />
				<div className="mt-1.5 h-[5px] w-[90%] rounded-sm bg-black/[.06]" />
				<div className="mt-1.5 h-[5px] w-[52%] rounded-sm bg-black/[.06]" />
				<div className="absolute right-3.5 top-3.5 flex h-[26px] w-[26px] items-center justify-center rounded-lg" style={{ background: tint, color }}>
					<Icon className="h-3.5 w-3.5" />
				</div>
				{/* hover remove */}
				<button
					onClick={onDelete}
					title="Remove document"
					className="absolute left-3.5 top-3.5 flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-black/[.06] bg-white/90 text-mc-muted opacity-0 backdrop-blur-sm transition-all hover:text-mc-danger group-hover:opacity-100"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
			<div className="border-t border-black/[.05] px-[15px] py-3">
				<div className="truncate text-[13px] font-semibold text-mc-text">{doc.filename}</div>
				<div className="mt-1.5 flex items-center gap-1.5">
					<StatusBadge status={doc.status} />
					<span className="text-[10.5px] text-mc-muted-2">Updated {timeAgo(doc.updatedAt)}</span>
				</div>
			</div>
		</div>
	);
}

function DocumentRow({ doc, divider, onDelete }: { doc: DocumentSummary; divider: boolean; onDelete: () => void }) {
	const { icon: Icon, color } = previewStyle(doc.sourceType);
	return (
		<div className={cn('group flex items-center gap-3 px-4 py-3', divider && 'border-t border-black/[.05]')}>
			<Icon className="h-4 w-4 flex-none" style={{ color }} />
			<span className="flex-1 truncate text-[13px] font-medium text-mc-text">{doc.filename}</span>
			<span className="font-mono text-[10.5px] uppercase text-mc-muted-2">{doc.sourceType}</span>
			<StatusBadge status={doc.status} />
			<span className="w-16 text-right text-[10.5px] text-mc-muted-2">{timeAgo(doc.updatedAt)}</span>
			<button
				onClick={onDelete}
				title="Remove document"
				className="flex h-7 w-7 items-center justify-center rounded-lg text-mc-muted opacity-0 transition-all hover:bg-mc-danger/[.08] hover:text-mc-danger group-hover:opacity-100"
			>
				<Trash2 className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
