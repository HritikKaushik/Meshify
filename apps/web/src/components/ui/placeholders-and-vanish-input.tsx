'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, useCallback, useRef, type ChangeEvent, type FormEvent } from 'react';
import { cn } from '@/lib/utils';

export function PlaceholdersAndVanishInput({
	placeholders,
	onChange,
	onSubmit,
	value,
	disabled,
}: {
	placeholders: string[];
	onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
	onSubmit: (e: FormEvent<HTMLFormElement>) => void;
	value: string;
	disabled?: boolean;
}) {
	const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const startAnimation = useCallback(() => {
		intervalRef.current = setInterval(() => {
			setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
		}, 3000);
	}, [placeholders.length]);

	useEffect(() => {
		startAnimation();
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [startAnimation]);

	return (
		<form
			onSubmit={onSubmit}
			className={cn(
				'w-full relative max-w-2xl mx-auto bg-card h-12 rounded-full overflow-hidden shadow-sm transition duration-200 border border-input',
				value && 'bg-card'
			)}
		>
			<input
				ref={inputRef}
				value={value}
				onChange={onChange}
				disabled={disabled}
				type="text"
				className="w-full relative text-sm sm:text-base z-50 border-none dark:text-white bg-transparent text-foreground h-full rounded-full focus:outline-none focus:ring-0 pl-4 sm:pl-6 pr-24"
			/>

			<button
				disabled={!value || disabled}
				type="submit"
				className="absolute right-2 top-1/2 z-50 -translate-y-1/2 h-9 w-9 rounded-full disabled:bg-muted bg-primary transition duration-200 flex items-center justify-center"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-primary-foreground h-4 w-4"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<motion.path
						d="M5 12l14 0"
						initial={{ strokeDasharray: '50%', strokeDashoffset: '50%' }}
						animate={{ strokeDashoffset: value ? 0 : '50%' }}
						transition={{ duration: 0.3, ease: 'linear' }}
					/>
					<path d="M13 18l6 -6" />
					<path d="M13 6l6 6" />
				</svg>
			</button>

			<div className="absolute inset-0 flex items-center rounded-full pointer-events-none">
				<AnimatePresence mode="wait">
					{!value && (
						<motion.p
							key={`current-placeholder-${currentPlaceholder}`}
							initial={{ y: 5, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: -15, opacity: 0 }}
							transition={{ duration: 0.3, ease: 'linear' }}
							className="text-sm sm:text-base font-normal text-muted-foreground pl-4 sm:pl-6 text-left w-[calc(100%-2rem)] truncate"
						>
							{placeholders[currentPlaceholder]}
						</motion.p>
					)}
				</AnimatePresence>
			</div>
		</form>
	);
}
