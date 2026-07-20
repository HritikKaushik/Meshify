import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out-expo cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
				outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				ghost: 'text-mc-text-3 hover:bg-mc-surface hover:text-mc-text',
				link: 'text-primary underline-offset-4 hover:underline',
				// Meshify: indigo→iris call-to-action.
				mesh: 'rounded-full bg-mc-accent text-white font-semibold shadow-glow-accent hover:bg-mc-accent-hi hover:shadow-glow-accent-lg active:translate-y-px',
				// Indigo "Mesh AI" action — AI-first CTAs.
				meshAi: 'rounded-full bg-mc-purple text-white font-semibold shadow-glow-purple hover:brightness-110 hover:shadow-glow-purple-lg active:translate-y-px',
				// Elevated surface button.
				glass: 'border border-mc-border bg-mc-card text-mc-text-2 shadow-e1 hover:bg-mc-surface hover:text-mc-text hover:border-mc-text/15',
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 rounded-md px-3 text-xs',
				lg: 'h-10 rounded-md px-8',
				xl: 'h-12 rounded-full px-7 text-[15px]',
				pill: 'h-9 rounded-full px-4 text-[12.5px]',
				icon: 'h-9 w-9',
				'icon-sm': 'h-8 w-8 rounded-lg',
			},
		},
		defaultVariants: { variant: 'default', size: 'default' },
	}
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
	const Comp = asChild ? Slot : 'button';
	return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
