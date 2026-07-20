import { cn } from '@/lib/utils';

/** A hairline divider. Non-radix (no extra dep) — decorative by default. */
export function Separator({
	orientation = 'horizontal',
	className,
	...props
}: { orientation?: 'horizontal' | 'vertical' } & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			role="separator"
			aria-orientation={orientation}
			data-orientation={orientation}
			className={cn('shrink-0 bg-mc-border', orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch', className)}
			{...props}
		/>
	);
}
