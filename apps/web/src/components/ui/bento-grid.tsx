import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function BentoGrid({ className, children }: { className?: string; children?: ReactNode }) {
	return <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto', className)}>{children}</div>;
}

export function BentoGridItem({
	className,
	title,
	description,
	header,
	icon,
}: {
	className?: string;
	title?: ReactNode;
	description?: ReactNode;
	header?: ReactNode;
	icon?: ReactNode;
}) {
	return (
		<div
			className={cn(
				'row-span-1 rounded-xl group/bento hover:shadow-xl transition duration-200 shadow-input dark:shadow-none p-4 border border-border justify-between flex flex-col space-y-4 bg-card',
				className
			)}
		>
			{header}
			<div className="group-hover/bento:translate-x-2 transition duration-200">
				{icon}
				<div className="font-sans font-bold text-card-foreground mb-2 mt-2">{title}</div>
				<div className="font-sans font-normal text-muted-foreground text-xs">{description}</div>
			</div>
		</div>
	);
}
