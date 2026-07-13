import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * HeroGeometric — the landing hero (Meshify Design Doc 4a). A reusable,
 * content-agnostic shell: pass `badge`, `title`, `subtitle` and `actions`; the
 * component owns the light "engineering blueprint" atmosphere — base gradients,
 * blueprint grid, lamp glow, orbital rings + constellation, and floating glass
 * slabs. All decoration is pointer-events:none. Motion is deliberately calm.
 */

// Floating translucent glass slabs — the "geometric" layer. Each drifts slowly.
type Shape = {
	w: number; h: number; rot: number; border: string; delay: string;
	left?: string; right?: string; top?: string; bottom?: string;
};
const SHAPES: Shape[] = [
	{ w: 300, h: 78, left: '-30px', top: '150px', rot: -15, border: 'rgba(79,141,251,.2)', delay: '0s' },
	{ w: 240, h: 66, right: '-20px', top: '250px', rot: 13, border: 'rgba(99,102,241,.2)', delay: '1s' },
	{ w: 190, h: 52, left: '130px', bottom: '50px', rot: 8, border: 'rgba(16,24,40,.06)', delay: '.5s' },
] as const;

export function HeroGeometric({
	badge,
	title,
	subtitle,
	actions,
	footnote,
	className,
}: {
	badge: ReactNode;
	title: ReactNode;
	subtitle: ReactNode;
	actions: ReactNode;
	footnote?: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn('relative flex flex-col items-center overflow-hidden px-6 pb-20 pt-24 text-center sm:px-10', className)}>
			{/* base radial gradients */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						'radial-gradient(900px 460px at 50% -8%,rgba(79,141,251,.16),transparent 60%),radial-gradient(1000px 560px at 50% 116%,rgba(99,102,241,.10),transparent 58%),linear-gradient(180deg,#FBFCFE,#F7F8FB)',
				}}
			/>
			{/* blueprint grid */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage:
						'linear-gradient(rgba(16,24,40,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(16,24,40,.035) 1px,transparent 1px)',
					backgroundSize: '46px 46px',
					maskImage: 'radial-gradient(120% 90% at 50% 16%,#000 28%,transparent 80%)',
					WebkitMaskImage: 'radial-gradient(120% 90% at 50% 16%,#000 28%,transparent 80%)',
				}}
			/>
			{/* lamp glow */}
			<div
				className="pointer-events-none absolute left-1/2 top-[-160px] h-[360px] w-[900px] -translate-x-1/2 animate-lamp blur-[36px]"
				style={{ background: 'radial-gradient(ellipse at center,rgba(99,102,241,.22),transparent 70%)' }}
			/>
			{/* orbits + constellation */}
			<svg viewBox="0 0 1440 820" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-90">
				<ellipse cx="720" cy="300" rx="640" ry="250" fill="none" stroke="rgba(26,115,232,.12)" strokeWidth="1" />
				<ellipse cx="720" cy="300" rx="440" ry="168" fill="none" stroke="rgba(99,102,241,.10)" strokeWidth="1" />
				<ellipse cx="720" cy="300" rx="820" ry="330" fill="none" stroke="rgba(26,115,232,.10)" strokeWidth="1" strokeDasharray="3 11" className="animate-dash" />
				<circle cx="180" cy="150" r="2" fill="#4F8DFB" className="animate-twinkle" />
				<circle cx="1290" cy="120" r="1.8" fill="#6366F1" className="animate-twinkle" style={{ animationDelay: '.6s' }} />
				<circle cx="1180" cy="470" r="1.6" fill="#4F8DFB" className="animate-twinkle" style={{ animationDelay: '1s' }} />
				<circle cx="250" cy="520" r="1.8" fill="#6366F1" opacity=".55" />
				<circle cx="520" cy="120" r="1.5" fill="#4F8DFB" className="animate-twinkle" style={{ animationDelay: '.3s' }} />
			</svg>
			{/* floating glass slabs */}
			{SHAPES.map((s, i) => (
				<div
					key={i}
					className="pointer-events-none absolute hidden animate-rise md:block"
					style={{ left: s.left, right: s.right, top: s.top, bottom: s.bottom, transform: `rotate(${s.rot}deg)`, animationDelay: s.delay }}
				>
					<div
						className="animate-drift backdrop-blur-[6px]"
						style={{
							width: s.w,
							height: s.h,
							borderRadius: 18,
							background: 'rgba(255,255,255,.7)',
							border: `1px solid ${s.border}`,
							boxShadow: '0 20px 50px rgba(79,110,240,.14)',
							animationDelay: s.delay,
						}}
					/>
				</div>
			))}

			{/* content */}
			<div className="relative z-10 flex max-w-4xl flex-col items-center">
				<div className="animate-textin">{badge}</div>
				<h1 className="mt-6 text-4xl font-semibold leading-[1.02] tracking-[-.04em] text-mc-text animate-textin sm:text-6xl lg:text-[74px]" style={{ animationDelay: '.1s' }}>
					{title}
				</h1>
				<p className="mt-7 max-w-xl text-base leading-relaxed text-mc-text-3 animate-textin sm:text-[18px]" style={{ animationDelay: '.34s' }}>
					{subtitle}
				</p>
				<div className="mt-9 flex flex-col items-center gap-3 animate-textin sm:flex-row sm:gap-3.5" style={{ animationDelay: '.46s' }}>
					{actions}
				</div>
				{footnote && (
					<div className="mt-6 font-mono text-[12.5px] tracking-[.03em] text-mc-muted-2 animate-textin" style={{ animationDelay: '.56s' }}>
						{footnote}
					</div>
				)}
			</div>
		</section>
	);
}
