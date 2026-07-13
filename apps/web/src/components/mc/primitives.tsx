import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type DotColor = 'success' | 'indexing' | 'accent' | 'danger' | 'purple' | 'teal' | 'muted';

const DOT_HEX: Record<DotColor, string> = {
	success: '#55C784',
	indexing: '#6E9BE8',
	accent: '#E39A4C',
	danger: '#E0604F',
	purple: '#8B7CC9',
	teal: '#5AA9A0',
	muted: '#5A5A66',
};

/** Small status indicator dot with optional glow + pulse (flight-deck telemetry). */
export function StatusDot({ color, glow = false, pulse = false, className }: { color: DotColor; glow?: boolean; pulse?: boolean; className?: string }) {
	const hex = DOT_HEX[color];
	return (
		<span
			className={cn('inline-block h-[7px] w-[7px] rounded-full', pulse && 'animate-meshpulse', className)}
			style={{ background: hex, boxShadow: glow ? `0 0 8px ${hex}` : undefined }}
		/>
	);
}

/** The amber gradient "M" mark used throughout the design. */
export function MeshLogo({ size = 26, className }: { size?: number; className?: string }) {
	return (
		<div
			className={cn('flex items-center justify-center rounded-lg font-mono font-bold text-mc-bg', className)}
			style={{
				width: size,
				height: size,
				fontSize: size * 0.46,
				background: 'linear-gradient(135deg,#F0B26A,#B96F2E)',
				boxShadow: '0 0 16px rgba(227,154,76,.4)',
			}}
		>
			M
		</div>
	);
}

/** The breathing amber "Mesh" avatar (radial glow + ✦), marks AI-authored content. */
export function MeshAvatar({ size = 28, breathe = false, className }: { size?: number; breathe?: boolean; className?: string }) {
	return (
		<div
			className={cn('flex flex-none items-center justify-center rounded-lg text-mc-accent-hi', breathe && 'animate-breathe', className)}
			style={{
				width: size,
				height: size,
				fontSize: size * 0.44,
				background: 'radial-gradient(circle at 30% 30%,rgba(240,178,106,.4),rgba(227,154,76,.12))',
				border: '1px solid rgba(227,154,76,.35)',
				boxShadow: '0 0 16px rgba(227,154,76,.25)',
			}}
		>
			✦
		</div>
	);
}

/** Glassmorphic surface card (translucent + blur), the workhorse container of the flight deck. */
export function GlassCard({ children, className, glow = false }: { children: ReactNode; className?: string; glow?: boolean }) {
	return (
		<div
			className={cn(
				'rounded-xl border border-white/[.06] bg-[rgba(18,18,24,.55)] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-[10px]',
				glow && 'border-mc-accent/20',
				className
			)}
		>
			{children}
		</div>
	);
}

/** A card that sweeps a faint light beam across itself — draws the eye to a live/priority item. */
export function BeamCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn('relative overflow-hidden rounded-xl border border-mc-accent/20 backdrop-blur-[10px]', className)}>
			<div
				className="pointer-events-none absolute inset-y-0 left-0 w-[36%] animate-beam"
				style={{ background: 'linear-gradient(90deg,transparent,rgba(227,154,76,.08),transparent)' }}
			/>
			<div className="relative">{children}</div>
		</div>
	);
}

/** Mesh status pill (e.g. "Mesh · 3 jobs") with a breathing dot and light sweep. */
export function MeshPill({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex items-center gap-2 overflow-hidden rounded-full border border-mc-accent/30 bg-mc-accent/[.08] px-3 py-1.5">
			<span className="h-2 w-2 animate-breathe rounded-full bg-mc-accent shadow-[0_0_10px_#E39A4C]" />
			<span className="font-medium text-[11.5px] text-mc-accent-hi">{children}</span>
			<div
				className="pointer-events-none absolute inset-y-0 w-[40%] animate-beam"
				style={{ background: 'linear-gradient(90deg,transparent,rgba(227,154,76,.14),transparent)' }}
			/>
		</div>
	);
}

/** Small monospace section label (uppercase, tracked) — "// PROJECT BRIEFING" etc. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn('font-mono text-[10px] uppercase tracking-[0.12em] text-mc-muted-2', className)}>{children}</span>;
}
