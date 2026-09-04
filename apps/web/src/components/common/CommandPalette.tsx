import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
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
 * Global ⌘K command palette. Dependency-free — a keyboard-navigable overlay over
 * the real project list plus core actions. Controlled by the shell (open state +
 * the ⌘K listener live there).
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
	const reduce = useReducedMotion();
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
			.map((p) => ({ id: p.id, label: p.name, hint: 'Project', color: projectColor(p.id), run: () => { onOpenChange(false); void navigate(`/projects/${p.id}`); } }));
		const filteredActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
		return [...projectItems, ...filteredActions];
	}, [query, projects, navigate, onNewProject, onOpenChange]);

	useEffect(() => { setActive(0); }, [query, open]);
	useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 10); else setQuery(''); }, [open]);

	return (
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal>
					<motion.div
						className="absolute inset-0 bg-black/50 backdrop-blur-sm"
						onClick={() => onOpenChange(false)}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
					/>
					<motion.div
						className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-mc-border bg-popover shadow-e4"
						initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={reduce ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
						transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
					>
						<div className="flex items-center gap-3 border-b border-mc-hairline px-4">
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
							<kbd className="rounded border border-mc-border px-1.5 py-0.5 font-mono text-micro text-mc-muted-2">ESC</kbd>
						</div>
						<div className="max-h-80 overflow-y-auto p-1.5">
							{items.length === 0 && <div className="px-3 py-6 text-center text-sm text-mc-text-3">No matches.</div>}
							{items.map((item, i) => (
								<button
									key={item.id}
									onMouseEnter={() => setActive(i)}
									onClick={() => item.run()}
									className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors', i === active ? 'bg-mc-accent/[.12]' : 'hover:bg-mc-surface')}
								>
									{item.color ? (
										<span className="h-[7px] w-[7px] flex-none rounded-sm" style={{ background: item.color }} />
									) : (
										<Plus className="h-3.5 w-3.5 flex-none text-mc-accent" />
									)}
									<span className="flex-1 truncate text-sm2 text-mc-text">{item.label}</span>
									<span className="font-mono text-micro text-mc-muted-2">{item.hint}</span>
									{i === active && <CornerDownLeft className="h-3 w-3 text-mc-muted-2" />}
								</button>
							))}
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
