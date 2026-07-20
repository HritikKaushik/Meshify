import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

/** A compact sun/moon theme toggle with a crossfade. Sits in the shell chrome. */
export function ThemeToggle({ className }: { className?: string }) {
	const { theme, toggle } = useTheme();
	const reduce = useReducedMotion();
	const isDark = theme === 'dark';

	return (
		<button
			type="button"
			onClick={toggle}
			role="switch"
			aria-checked={!isDark}
			aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
			title={isDark ? 'Light theme' : 'Dark theme'}
			className={cn(
				'relative flex h-8 w-8 items-center justify-center rounded-lg border border-mc-border bg-mc-card/60 text-mc-text-3 transition-colors duration-200 ease-out-expo hover:bg-mc-surface hover:text-mc-text',
				className
			)}
		>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={theme}
					initial={reduce ? false : { opacity: 0, rotate: -35, scale: 0.7 }}
					animate={{ opacity: 1, rotate: 0, scale: 1 }}
					exit={reduce ? undefined : { opacity: 0, rotate: 35, scale: 0.7 }}
					transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
					className="absolute inset-0 flex items-center justify-center"
				>
					{isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
				</motion.span>
			</AnimatePresence>
		</button>
	);
}
