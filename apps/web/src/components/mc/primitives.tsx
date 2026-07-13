import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DotColor = 'success' | 'indexing' | 'accent' | 'danger' | 'purple' | 'teal' | 'muted';

const DOT_HEX: Record<DotColor, string> = {
	success: '#1E9E6A',
	indexing: '#4F8DFB',
	accent: '#1A73E8',
	danger: '#E5484D',
	purple: '#6366F1',
	teal: '#1A73E8',
	muted: '#B4BAC8',
};

/** Small status indicator dot with optional glow + pulse. */
export function StatusDot({ color, glow = false, pulse = false, className }: { color: DotColor; glow?: boolean; pulse?: boolean; className?: string }) {
	const hex = DOT_HEX[color];
	return (
		<span
			className={cn('inline-block h-[7px] w-[7px] rounded-full', pulse && 'animate-meshpulse', className)}
			style={{ background: hex, boxShadow: glow ? `0 0 8px ${hex}66` : undefined }}
		/>
	);
}

/**
 * The Meshify mark — a single traversal through five nodes that reads as an "M"
 * and as a path across a knowledge graph. White strokes/nodes so it sits on the
 * blue→indigo squircle lockup.
 */
export function MeshMark({ size = 20, stroke = '#fff', node = '#fff', center = '#fff' }: { size?: number; stroke?: string; node?: string; center?: string }) {
	return (
		<svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
			<path d="M18 80 L18 22 L50 55 L82 22 L82 80" stroke={stroke} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="18" cy="80" r="9" fill={node} />
			<circle cx="18" cy="22" r="9" fill={node} />
			<circle cx="82" cy="22" r="9" fill={node} />
			<circle cx="82" cy="80" r="9" fill={node} />
			<circle cx="50" cy="55" r="12" fill={center} />
		</svg>
	);
}

/** The Meshify logo lockup: the mark inside a blue→indigo squircle. */
export function MeshLogo({ size = 27, className }: { size?: number; className?: string }) {
	return (
		<div
			className={cn('flex items-center justify-center', className)}
			style={{
				width: size,
				height: size,
				borderRadius: size * 0.33,
				background: 'linear-gradient(135deg,#4F8DFB,#6366F1)',
				boxShadow: '0 4px 12px rgba(79,110,240,.32)',
			}}
		>
			<MeshMark size={size * 0.66} />
		</div>
	);
}

/**
 * The "Mesh" (AI) avatar — the same blue→indigo squircle lockup marking
 * AI-authored content. `breathe` gives it a subtle glow pulse.
 */
export function MeshAvatar({ size = 28, breathe = false, className }: { size?: number; breathe?: boolean; className?: string }) {
	return (
		<div
			className={cn('flex flex-none items-center justify-center', breathe && 'animate-breathe', className)}
			style={{
				width: size,
				height: size,
				borderRadius: size * 0.33,
				background: 'linear-gradient(135deg,#4F8DFB,#6366F1)',
				boxShadow: '0 4px 14px rgba(79,110,240,.3)',
			}}
		>
			<MeshMark size={size * 0.66} />
		</div>
	);
}

/** White surface card with a hairline border and a soft elevation shadow. */
export function GlassCard({ children, className, glow = false }: { children: ReactNode; className?: string; glow?: boolean }) {
	return (
		<div
			className={cn(
				'rounded-2xl border bg-white shadow-[0_10px_30px_rgba(16,24,40,.06),0_1px_2px_rgba(16,24,40,.04)]',
				glow ? 'border-mc-accent/20' : 'border-black/[.06]',
				className
			)}
		>
			{children}
		</div>
	);
}

/** A highlighted card with a faint indigo→blue tint and a slow light sweep. */
export function BeamCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn('relative overflow-hidden rounded-2xl border border-mc-purple/[.16] bg-white shadow-[0_8px_26px_rgba(79,110,240,.1)]', className)}>
			<div
				className="pointer-events-none absolute inset-y-0 left-0 w-[36%] animate-beam"
				style={{ background: 'linear-gradient(90deg,transparent,rgba(99,102,241,.06),transparent)' }}
			/>
			<div className="relative">{children}</div>
		</div>
	);
}

/** Mesh status pill (e.g. "Mesh · online") with a breathing indigo dot. */
export function MeshPill({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex items-center gap-2 overflow-hidden rounded-full border border-mc-purple/25 bg-mc-purple/[.07] px-3 py-1.5">
			<span className="h-2 w-2 animate-breathe rounded-full bg-mc-purple shadow-[0_0_8px_rgba(99,102,241,.6)]" />
			<span className="font-medium text-[11.5px] text-[#4F46E5]">{children}</span>
		</div>
	);
}

/** Small monospace section label (uppercase, tracked) — "// PROJECT BRIEFING" etc. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn('font-mono text-[10px] uppercase tracking-[0.12em] text-mc-muted-2', className)}>{children}</span>;
}
