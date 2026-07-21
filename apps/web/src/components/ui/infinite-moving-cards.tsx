import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { ProviderBrandIcon } from '@/components/ProviderBrandIcon';

// Aceternity UI — Infinite Moving Cards. A CSS-driven marquee: the track is
// duplicated once at mount and translated by -50% on an infinite loop, so the
// row scrolls seamlessly. Adapted here to show integrations (available + coming
// soon) instead of testimonial cards.

export interface IntegrationItem {
	name: string;
	/** Key understood by ProviderBrandIcon. */
	iconKey: string;
	available: boolean;
}

export function InfiniteMovingCards({
	items,
	direction = 'left',
	speed = 'slow',
	pauseOnHover = true,
	className,
}: {
	items: IntegrationItem[];
	direction?: 'left' | 'right';
	speed?: 'fast' | 'normal' | 'slow';
	pauseOnHover?: boolean;
	className?: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollerRef = useRef<HTMLUListElement>(null);
	const initialized = useRef(false);
	const [start, setStart] = useState(false);

	useEffect(() => {
		// Guard against React StrictMode double-invoke duplicating the track twice.
		if (initialized.current || !containerRef.current || !scrollerRef.current) return;
		initialized.current = true;

		for (const child of Array.from(scrollerRef.current.children)) {
			scrollerRef.current.appendChild(child.cloneNode(true));
		}
		containerRef.current.style.setProperty('--animation-direction', direction === 'left' ? 'forwards' : 'reverse');
		containerRef.current.style.setProperty('--animation-duration', speed === 'fast' ? '30s' : speed === 'normal' ? '55s' : '85s');
		setStart(true);
	}, [direction, speed]);

	return (
		<div
			ref={containerRef}
			className={cn(
				'scroller relative z-20 w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]',
				className
			)}
		>
			<ul
				ref={scrollerRef}
				className={cn(
					'flex w-max min-w-full shrink-0 flex-nowrap gap-4 py-2',
					start && 'animate-scroll',
					pauseOnHover && 'hover:[animation-play-state:paused]'
				)}
			>
				{items.map((item) => (
					<li
						key={item.name}
						className="flex w-max shrink-0 items-center gap-3 rounded-2xl border border-mc-border bg-mc-card/60 px-5 py-3.5 backdrop-blur-sm"
					>
						<span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-mc-border bg-mc-text/[.05] text-mc-text">
							<ProviderBrandIcon iconKey={item.iconKey} size={18} />
						</span>
						<div className="pr-1">
							<div className="whitespace-nowrap text-[13px] font-semibold leading-tight text-mc-text">{item.name}</div>
							<div className={cn('mt-0.5 text-[10px] font-semibold uppercase tracking-wide', item.available ? 'text-mc-accent' : 'text-mc-text-3')}>
								{item.available ? 'Available' : 'Coming soon'}
							</div>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
