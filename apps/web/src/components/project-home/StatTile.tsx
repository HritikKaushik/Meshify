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
			? 'border-mc-success/20 bg-mc-success/[.04]'
			: accent === 'indexing'
				? 'border-mc-indexing/20 bg-mc-indexing/[.04]'
				: accent === 'accent'
					? 'border-mc-accent/20 bg-mc-accent/[.04]'
					: 'border-white/[.08] bg-white/[.02]';
	const valueColor =
		accent === 'success' ? 'text-mc-success' : accent === 'indexing' ? 'text-mc-indexing' : accent === 'accent' ? 'text-mc-accent' : 'text-mc-text';
	return (
		<div className={cn('rounded-xl border p-4', tint)}>
			<div className="font-mono text-[9.5px] tracking-[.09em] text-mc-muted">{label}</div>
			<div className={cn('mt-1.5 text-2xl font-semibold', valueColor)}>{value}</div>
			{sub && <div className="mt-0.5 text-[11px] text-mc-text-3">{sub}</div>}
		</div>
	);
}
