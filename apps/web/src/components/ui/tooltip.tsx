import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Dependency-free tooltip. A CSS hover/focus label — no Radix, so it can't pull a
 * duplicate React through the bundler. Accessible: the label is a `role=tooltip`
 * sibling revealed on hover and keyboard focus of the wrapped control.
 */

type Side = 'top' | 'right' | 'bottom' | 'left';

const SIDE_POS: Record<Side, string> = {
	right: 'left-full top-1/2 ml-2 -translate-y-1/2',
	left: 'right-full top-1/2 mr-2 -translate-y-1/2',
	top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
	bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
};

/** No-op provider kept for API compatibility with the shadcn tooltip shape. */
export function TooltipProvider({ children }: { children: ReactNode }) {
	return <>{children}</>;
}

export function SimpleTooltip({
	label,
	children,
	side = 'right',
	className,
}: {
	label: ReactNode;
	children: ReactNode;
	side?: Side;
	className?: string;
}) {
	return (
		<span className="group/tt relative inline-flex">
			{children}
			<span
				role="tooltip"
				className={cn(
					'pointer-events-none absolute z-[70] whitespace-nowrap rounded-lg border border-mc-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-e3 transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
					SIDE_POS[side],
					className
				)}
			>
				{label}
			</span>
		</span>
	);
}
