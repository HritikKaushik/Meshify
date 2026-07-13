import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, CornerDownLeft } from 'lucide-react';
import type { Project } from '@/api';
import { projectColor } from '@/lib/project-color';
import { cn } from '@/lib/utils';

interface Item {
	id: string;
	label: string;
	hint?: string;
	color?: string;
	run: () => void;
}

/**
 * Global ⌘K command palette (design: "&#8984;K holds everything"). Dependency-free
 * — a keyboard-navigable overlay over the real project list plus core actions.
 * Controlled by the shell (open state + the ⌘K listener live there).
 */
export function CommandPalette({
	open,
	onOpenChange,
	projects,
	onNewProject,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	projects: Project[];
	onNewProject: () => void;
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const items = useMemo<Item[]>(() => {
		const q = query.trim().toLowerCase();
		const actions: Item[] = [
			{ id: '__new', label: 'Create new project', hint: 'Action', run: () => { onOpenChange(false); onNewProject(); } },
		];
		const projectItems: Item[] = projects
			.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
			.map((p) => ({ id: p.id, label: p.name, hint: 'Project', color: projectColor(p.id), run: () => { onOpenChange(false); navigate(`/projects/${p.id}`); } }));
		const filteredActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
		return [...projectItems, ...filteredActions];
	}, [query, projects, navigate, onNewProject, onOpenChange]);

	useEffect(() => { setActive(0); }, [query, open]);
	useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 10); else setQuery(''); }, [open]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal>
			<div className="absolute inset-0 bg-[rgba(16,24,40,.28)] backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
			<div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-[0_30px_80px_rgba(16,24,40,.22)]">
				<div className="flex items-center gap-3 border-b border-black/[.06] px-4">
					<Search className="h-4 w-4 text-mc-muted-2" />
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Escape') onOpenChange(false);
							else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
							else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
							else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
						}}
						placeholder="Search projects or run a command…"
						className="h-12 flex-1 bg-transparent text-sm text-mc-text placeholder:text-mc-muted focus:outline-none"
					/>
					<kbd className="rounded border border-black/[.12] px-1.5 py-0.5 font-mono text-[10px] text-mc-muted-2">ESC</kbd>
				</div>
				<div className="max-h-80 overflow-y-auto p-1.5">
					{items.length === 0 && <div className="px-3 py-6 text-center text-sm text-mc-text-3">No matches.</div>}
					{items.map((item, i) => (
						<button
							key={item.id}
							onMouseEnter={() => setActive(i)}
							onClick={() => item.run()}
							className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', i === active ? 'bg-mc-accent/[.08]' : 'hover:bg-mc-surface')}
						>
							{item.color ? (
								<span className="h-[7px] w-[7px] flex-none rounded-sm" style={{ background: item.color }} />
							) : (
								<Plus className="h-3.5 w-3.5 flex-none text-mc-accent" />
							)}
							<span className="flex-1 truncate text-[13px] text-mc-text">{item.label}</span>
							<span className="font-mono text-[10px] text-mc-muted-2">{item.hint}</span>
							{i === active && <CornerDownLeft className="h-3 w-3 text-mc-muted-2" />}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
