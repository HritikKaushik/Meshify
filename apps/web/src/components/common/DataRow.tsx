import { cn } from '@/lib/utils';

/**
 * A label/value row for detail lists (config, settings, repository details).
 * Consolidates the previously-duplicated Row / ConfigRow / DetailRow helpers.
 * `divider` draws a bottom hairline (except on the last row via `last:*`).
 */
export function DataRow({
	label,
	value,
	mono = false,
	divider = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
	divider?: boolean;
}) {
	return (
		<div className={cn('flex items-baseline justify-between gap-4', divider && 'border-b border-white/[.04] pb-3 last:border-0 last:pb-0')}>
			<span className="text-xs text-mc-text-3">{label}</span>
			<span className={cn('truncate text-right text-xs text-mc-text', mono && 'font-mono')}>{value}</span>
		</div>
	);
}
