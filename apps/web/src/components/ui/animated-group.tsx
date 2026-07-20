import { Children, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * AnimatedGroup — staggers its direct children in on mount using container/item
 * variants (ported to motion/react from the ibelick pattern). Respects
 * prefers-reduced-motion (renders immediately, no transform/blur).
 */
export function AnimatedGroup({
	children,
	className,
	variants,
}: {
	children: ReactNode;
	className?: string;
	variants?: { container?: Variants; item?: Variants };
}) {
	const reduce = useReducedMotion();
	const container: Variants = variants?.container ?? {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
	};
	const item: Variants = variants?.item ?? {
		hidden: { opacity: 0, y: 16, filter: 'blur(8px)' },
		visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', bounce: 0.3, duration: 1.2 } },
	};

	if (reduce) return <div className={className}>{children}</div>;

	return (
		<motion.div initial="hidden" animate="visible" variants={container} className={cn(className)}>
			{Children.map(children, (child, i) => (
				<motion.div key={i} variants={item}>
					{child}
				</motion.div>
			))}
		</motion.div>
	);
}
