import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Org-overview stat tile (design 3b). `accent` tints the border/value for emphasis. */
export function StatTile({
	label,
	value,
	sub,
	accent,
}: {
	label: string;
	value: ReactNode;
	sub?: ReactNode;
	accent?: 'success' | 'indexing' | 'accent';
}) {
	const tint =
		accent === 'success'
			? 'border-mc-success/20 bg-mc-success/[.05]'
			: accent === 'indexing'
				? 'border-mc-indexing/20 bg-mc-indexing/[.05]'
				: accent === 'accent'
					? 'border-mc-accent/20 bg-mc-accent/[.05]'
					: 'border-black/[.06] bg-white';
	const valueColor =
		accent === 'success' ? 'text-mc-success' : accent === 'indexing' ? 'text-mc-accent-hi' : accent === 'accent' ? 'text-mc-accent' : 'text-mc-text';
	return (
		<div className={cn('rounded-xl border p-4 shadow-[0_1px_3px_rgba(16,24,40,.04)]', tint)}>
			<div className="font-mono text-[9.5px] uppercase tracking-[.09em] text-mc-muted">{label}</div>
			<div className={cn('mt-1.5 text-2xl font-semibold', valueColor)}>{value}</div>
			{sub && <div className="mt-0.5 text-[11px] text-mc-text-3">{sub}</div>}
		</div>
	);
}
