import { type ReactNode, useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';

export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Reveal — a small fade + lift when the element scrolls into view (once).
 * Respects prefers-reduced-motion. The app's standard section/card entrance.
 */
export function Reveal({
	children,
	delay = 0,
	y = 14,
	className,
	as = 'div',
}: {
	children: ReactNode;
	delay?: number;
	y?: number;
	className?: string;
	as?: 'div' | 'section' | 'li' | 'span';
}) {
	const reduce = useReducedMotion();
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: '-60px' });
	const MotionTag = motion[as];
	return (
		<MotionTag
			ref={ref}
			className={className}
			initial={reduce ? false : { opacity: 0, y }}
			animate={inView || reduce ? { opacity: 1, y: 0 } : undefined}
			transition={{ duration: 0.5, ease: EASE, delay }}
		>
			{children}
		</MotionTag>
	);
}

/** Stagger — reveals direct children in sequence as the group enters view. */
export function Stagger({ children, className, gap = 0.06 }: { children: ReactNode; className?: string; gap?: number }) {
	const reduce = useReducedMotion();
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: '-60px' });
	return (
		<motion.div
			ref={ref}
			className={className}
			initial={reduce ? false : 'hidden'}
			animate={inView || reduce ? 'show' : 'hidden'}
			variants={{ show: { transition: { staggerChildren: gap } } }}
		>
			{children}
		</motion.div>
	);
}

export function StaggerItem({ children, className, y = 12 }: { children: ReactNode; className?: string; y?: number }) {
	return (
		<motion.div
			className={className}
			variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
		>
			{children}
		</motion.div>
	);
}

/** Hover-lift wrapper — a gentle translate on pointer hover (transform-only). */
export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.div className={className} whileHover={reduce ? undefined : { y: -3 }} transition={{ duration: 0.2, ease: EASE }}>
			{children}
		</motion.div>
	);
}

/**
 * AnimatedCounter — counts up to `value` on first view. Renders the final value
 * immediately under reduced-motion. `format` appends units (%, etc.).
 */
export function AnimatedCounter({
	value,
	className,
	style,
	format = (n) => String(Math.round(n)),
	duration = 1.1,
}: {
	value: number;
	className?: string;
	style?: React.CSSProperties;
	format?: (n: number) => string;
	duration?: number;
}) {
	const reduce = useReducedMotion();
	const ref = useRef<HTMLSpanElement>(null);
	const inView = useInView(ref, { once: true });
	const [display, setDisplay] = useState(reduce ? value : 0);

	useEffect(() => {
		if (reduce || !inView) {
			setDisplay(value);
			return;
		}
		const controls = animate(0, value, { duration, ease: EASE, onUpdate: (v) => setDisplay(v) });
		return () => controls.stop();
	}, [inView, value, reduce, duration]);

	return (
		<span ref={ref} className={className} style={style}>
			{format(display)}
		</span>
	);
}

/** PageTransition — a subtle fade+lift for route content. Key it by pathname. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.div
			className={className}
			initial={reduce ? false : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.24, ease: EASE }}
		>
			{children}
		</motion.div>
	);
}
