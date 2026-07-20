import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
	'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro font-medium transition-colors whitespace-nowrap',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-mc-accent/[.14] text-mc-accent-lo',
				neutral: 'border-mc-border bg-mc-surface text-mc-text-3',
				outline: 'border-mc-border text-mc-text-2',
				success: 'border-transparent bg-mc-success/[.14] text-mc-success-lo',
				warning: 'border-transparent bg-mc-amber/[.14] text-mc-amber-lo',
				danger: 'border-transparent bg-mc-danger/[.14] text-mc-danger-lo',
				purple: 'border-transparent bg-mc-purple/[.14] text-mc-purple-lo',
			},
		},
		defaultVariants: { variant: 'default' },
	}
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
