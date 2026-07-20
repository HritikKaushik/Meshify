import { cn } from '@/lib/utils';

/** A shimmering placeholder block. Uses the theme-aware .mc-skeleton sheen. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn('mc-skeleton rounded-md', className)} {...props} />;
}
