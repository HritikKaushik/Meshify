'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface HoverEffectItem {
	title: string;
	description: string;
	link?: string;
}

export function HoverEffect({
	items,
	className,
	onItemClick,
}: {
	items: HoverEffectItem[];
	className?: string;
	onItemClick?: (item: HoverEffectItem, index: number) => void;
}) {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	return (
		<div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
			{items.map((item, idx) => (
				<div
					key={item.title}
					className="relative group block p-2 h-full w-full cursor-pointer"
					onMouseEnter={() => setHoveredIndex(idx)}
					onMouseLeave={() => setHoveredIndex(null)}
					onClick={() => onItemClick?.(item, idx)}
				>
					<AnimatePresence>
						{hoveredIndex === idx && (
							<motion.span
								className="absolute inset-0 h-full w-full bg-primary/20 block rounded-3xl"
								layoutId="hoverBackground"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1, transition: { duration: 0.15 } }}
								exit={{ opacity: 0, transition: { duration: 0.15, delay: 0.2 } }}
							/>
						)}
					</AnimatePresence>
					<div className="relative z-20 rounded-2xl h-full w-full p-4 overflow-hidden border border-border bg-card group-hover:border-primary/60 transition-colors">
						<div className="relative z-50">
							<h4 className="text-card-foreground font-bold tracking-wide">{item.title}</h4>
							<p className="mt-4 text-muted-foreground tracking-wide leading-relaxed text-sm">{item.description}</p>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
