import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small monospace section label used throughout the workspace and rails.
 * Consolidates the ad-hoc Section / SectionLabel helpers. With `divider`, a
 * hairline extends to fill the row (the dashboard/section style); `action`
 * renders a trailing element (e.g. a "View all →" link).
 */
export function SectionHeading({
	children,
	divider = false,
	action,
	className,
}: {
	children: ReactNode;
	divider?: boolean;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn('flex items-center gap-3', className)}>
			<span className="font-mono text-[10px] tracking-[.11em] text-mc-muted-2">{children}</span>
			{divider && <div className="h-px flex-1 bg-white/[.06]" />}
			{action}
		</div>
	);
}
