'use client';
import { useEffect } from 'react';
import { motion, stagger, useAnimate, useInView } from 'motion/react';
import { cn } from '@/lib/utils';

type Word = { text: string; className?: string };

/**
 * Aceternity "Typewriter Effect". Text reveals character-by-character with a
 * blinking cursor. Adapted for in-app use: the original bakes in headline sizes
 * / center alignment / a blue cursor — here typography is inherited (style via
 * `className`) and `duration`/`stagger` are exposed so callers can tune reveal
 * speed for variable-length content (the defaults match the upstream demo).
 */
export function TypewriterEffect({
	words,
	className,
	cursorClassName,
	duration = 0.3,
	stagger: staggerDelay = 0.1,
}: {
	words: Word[];
	className?: string;
	cursorClassName?: string;
	duration?: number;
	stagger?: number;
}) {
	const wordsArray = words.map((word) => ({ ...word, chars: word.text.split('') }));
	const [scope, animate] = useAnimate();
	const isInView = useInView(scope);

	useEffect(() => {
		if (isInView) {
			animate(
				'span',
				{ display: 'inline-block', opacity: 1, width: 'fit-content' },
				{ duration, delay: stagger(staggerDelay), ease: 'easeInOut' }
			);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isInView]);

	return (
		<div className={cn('inline', className)}>
			<motion.div ref={scope} className="inline">
				{wordsArray.map((word, idx) => (
					<div key={`word-${idx}`} className="inline-block">
						{word.chars.map((char, index) => (
							<motion.span
								key={`char-${index}`}
								className={cn('hidden opacity-0', word.className)}
							>
								{char}
							</motion.span>
						))}
						&nbsp;
					</div>
				))}
			</motion.div>
			<motion.span
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
				className={cn('inline-block h-4 w-[3px] translate-y-[2px] rounded-sm bg-mc-purple', cursorClassName)}
			/>
		</div>
	);
}

/**
 * The "smooth" variant: reveals the whole line by animating a clipping mask's
 * width. Note it forces `white-space: nowrap`, so it suits short single-line
 * phrases (headlines) rather than wrapping paragraphs.
 */
export function TypewriterEffectSmooth({
	words,
	className,
	cursorClassName,
}: {
	words: Word[];
	className?: string;
	cursorClassName?: string;
}) {
	const wordsArray = words.map((word) => ({ ...word, chars: word.text.split('') }));

	return (
		<div className={cn('flex space-x-1', className)}>
			<motion.div
				className="overflow-hidden pb-2"
				initial={{ width: '0%' }}
				whileInView={{ width: 'fit-content' }}
				transition={{ duration: 2, ease: 'linear', delay: 1 }}
			>
				<div className="font-bold" style={{ whiteSpace: 'nowrap' }}>
					{wordsArray.map((word, idx) => (
						<div key={`word-${idx}`} className="inline-block">
							{word.chars.map((char, index) => (
								<span key={`char-${index}`} className={cn(word.className)}>
									{char}
								</span>
							))}
							&nbsp;
						</div>
					))}
				</div>
			</motion.div>
			<motion.span
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
				className={cn('block h-4 w-[3px] rounded-sm bg-mc-purple', cursorClassName)}
			/>
		</div>
	);
}
