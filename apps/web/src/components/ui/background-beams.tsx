'use client';
import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

const paths = [
	'M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875',
	'M-373 -197C-373 -197 -305 208 159 335C623 462 691 867 691 867',
	'M-366 -205C-366 -205 -298 200 166 327C630 454 698 859 698 859',
	'M-359 -213C-359 -213 -291 192 173 319C637 446 705 851 705 851',
	'M-352 -221C-352 -221 -284 184 180 311C644 438 712 843 712 843',
	'M-345 -229C-345 -229 -277 176 187 303C651 430 719 835 719 835',
	'M-338 -237C-338 -237 -270 168 194 295C658 422 726 827 726 827',
	'M-331 -245C-331 -245 -263 160 201 287C665 414 733 819 733 819',
	'M-324 -253C-324 -253 -256 152 208 279C672 406 740 811 740 811',
	'M-317 -261C-317 -261 -249 144 215 271C679 398 747 803 747 803',
];

export const BackgroundBeams = React.memo(function BackgroundBeams({ className }: { className?: string }) {
	return (
		<div className={cn('pointer-events-none absolute inset-0 h-full w-full overflow-hidden [mask-repeat:no-repeat] [mask-size:40px]', className)}>
			<svg className="pointer-events-none absolute h-full w-full" width="100%" height="100%" viewBox="0 0 696 316" fill="none">
				<title>Background beams</title>
				{paths.map((path, index) => (
					<motion.path
						key={`path-first-${index}`}
						d={path}
						stroke={`url(#linearGradient-${index})`}
						strokeOpacity="0.4"
						strokeWidth="0.5"
					/>
				))}
				<defs>
					{paths.map((_path, index) => (
						<motion.linearGradient
							id={`linearGradient-${index}`}
							key={`gradient-${index}`}
							initial={{ x1: '0%', x2: '0%', y1: '0%', y2: '0%' }}
							animate={{
								x1: ['0%', '100%'],
								x2: ['0%', '95%'],
								y1: ['0%', `${93 + Math.random() * 8}%`],
								y2: ['0%', `${70 + Math.random() * 30}%`],
							}}
							transition={{
								duration: Math.random() * 7 + 8,
								ease: 'easeInOut',
								repeat: Infinity,
								delay: Math.random() * 8,
							}}
						>
							<stop stopColor="#6366f1" stopOpacity="0" />
							<stop stopColor="#6366f1" />
							<stop offset="32.5%" stopColor="#818cf8" />
							<stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
						</motion.linearGradient>
					))}
				</defs>
			</svg>
		</div>
	);
});
