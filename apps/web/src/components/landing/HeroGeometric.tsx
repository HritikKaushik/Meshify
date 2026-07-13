import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * HeroGeometric — the landing hero (design 3a). A reusable, content-agnostic
 * shell: pass `badge`, `title`, `subtitle` and `actions`; the component owns the
 * "Mission Control inside an engineering blueprint" atmosphere — base gradients,
 * blueprint grid, lamp glow, orbital rings + constellation, floating glass shapes
 * (the geometric layer), and a couple of subtle meteors. All decoration is
 * pointer-events:none so it never intercepts clicks. Motion is deliberately calm.
 */

// Floating translucent glass slabs — the "geometric" layer. Each drifts slowly.
type Shape = {
	w: number; h: number; rot: number; from: string; to: string; border: string; delay: string;
	left?: string; right?: string; top?: string; bottom?: string;
};
const SHAPES: Shape[] = [
	{ w: 320, h: 82, left: '-40px', top: '150px', rot: -16, from: 'rgba(240,178,106,.20)', to: 'rgba(185,111,46,.03)', border: 'rgba(240,178,106,.24)', delay: '0s' },
	{ w: 260, h: 70, right: '-30px', top: '250px', rot: 14, from: 'rgba(110,155,232,.18)', to: 'rgba(110,155,232,.02)', border: 'rgba(110,155,232,.22)', delay: '1s' },
	{ w: 200, h: 56, left: '120px', bottom: '60px', rot: 9, from: 'rgba(139,124,201,.16)', to: 'rgba(139,124,201,.02)', border: 'rgba(139,124,201,.2)', delay: '.5s' },
	{ w: 150, h: 44, right: '150px', bottom: '110px', rot: -10, from: 'rgba(85,199,132,.14)', to: 'rgba(85,199,132,.02)', border: 'rgba(85,199,132,.18)', delay: '.8s' },
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
						'radial-gradient(900px 460px at 50% -6%,rgba(227,154,76,.16),transparent 62%),radial-gradient(1100px 620px at 50% 118%,rgba(110,155,232,.12),transparent 60%),radial-gradient(700px 500px at 12% 40%,rgba(139,124,201,.08),transparent 60%)',
				}}
			/>
			{/* blueprint grid */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage:
						'linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)',
					backgroundSize: '44px 44px',
					maskImage: 'radial-gradient(120% 90% at 50% 20%,#000 30%,transparent 82%)',
					WebkitMaskImage: 'radial-gradient(120% 90% at 50% 20%,#000 30%,transparent 82%)',
				}}
			/>
			{/* lamp glow */}
			<div
				className="pointer-events-none absolute left-1/2 top-[-140px] h-[340px] w-[900px] -translate-x-1/2 animate-lamp blur-[30px]"
				style={{ background: 'radial-gradient(ellipse at center,rgba(240,178,106,.28),transparent 70%)' }}
			/>
			{/* orbits + constellation */}
			<svg viewBox="0 0 1440 820" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-60">
				<ellipse cx="720" cy="300" rx="640" ry="250" fill="none" stroke="rgba(227,154,76,.14)" strokeWidth="1" />
				<ellipse cx="720" cy="300" rx="440" ry="168" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
				<ellipse cx="720" cy="300" rx="820" ry="330" fill="none" stroke="rgba(110,155,232,.10)" strokeWidth="1" strokeDasharray="4 10" className="animate-dash" />
				<circle cx="180" cy="150" r="1.6" fill="#E39A4C" className="animate-twinkle" />
				<circle cx="1290" cy="120" r="1.4" fill="#6E9BE8" className="animate-twinkle" style={{ animationDelay: '.6s' }} />
				<circle cx="1180" cy="470" r="1.5" fill="#fff" opacity=".5" className="animate-twinkle" style={{ animationDelay: '1s' }} />
				<circle cx="250" cy="520" r="1.5" fill="#E39A4C" opacity=".7" />
				<circle cx="960" cy="90" r="1.2" fill="#fff" opacity=".45" />
				<circle cx="520" cy="120" r="1.3" fill="#8B7CC9" className="animate-twinkle" style={{ animationDelay: '.3s' }} />
			</svg>
			{/* floating glass shapes */}
			{SHAPES.map((s, i) => (
				<div
					key={i}
					className="pointer-events-none absolute hidden animate-rise md:block"
					style={{ left: s.left, right: s.right, top: s.top, bottom: s.bottom, transform: `rotate(${s.rot}deg)`, animationDelay: s.delay }}
				>
					<div
						className="animate-drift backdrop-blur-[3px]"
						style={{
							width: s.w,
							height: s.h,
							borderRadius: s.h / 2,
							background: `linear-gradient(135deg,${s.from},${s.to})`,
							border: `1px solid ${s.border}`,
							boxShadow: 'inset 0 1px 0 rgba(255,255,255,.16)',
							animationDelay: s.delay,
						}}
					/>
				</div>
			))}
			{/* meteors (subtle) */}
			<div className="pointer-events-none absolute right-[22%] top-[6%] h-[130px] w-[2px] animate-meteor" style={{ background: 'linear-gradient(to bottom,rgba(255,255,255,.7),transparent)', transform: 'rotate(218deg)', animationDelay: '1.5s' }} />
			<div className="pointer-events-none absolute right-[40%] top-[2%] h-[90px] w-[1.5px] animate-meteor" style={{ background: 'linear-gradient(to bottom,rgba(240,178,106,.7),transparent)', transform: 'rotate(218deg)', animationDelay: '4s' }} />

			{/* content */}
			<div className="relative z-10 flex max-w-4xl flex-col items-center">
				<div className="animate-textin">{badge}</div>
				<h1 className="mt-6 text-4xl font-semibold leading-[1.04] tracking-[-.035em] text-mc-text animate-textin sm:text-6xl lg:text-[74px]" style={{ animationDelay: '.1s' }}>
					{title}
				</h1>
				<p className="mt-7 max-w-xl text-base leading-relaxed text-mc-text-2 animate-textin sm:text-[17px]" style={{ animationDelay: '.34s' }}>
					{subtitle}
				</p>
				<div className="mt-9 flex flex-col items-center gap-3 animate-textin sm:flex-row sm:gap-4" style={{ animationDelay: '.46s' }}>
					{actions}
				</div>
				{footnote && (
					<div className="mt-6 font-mono text-[12.5px] tracking-[.04em] text-mc-muted-2 animate-textin" style={{ animationDelay: '.56s' }}>
						{footnote}
					</div>
				)}
			</div>
		</section>
	);
}
