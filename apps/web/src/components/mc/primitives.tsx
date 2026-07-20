import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DotColor = 'success' | 'indexing' | 'accent' | 'danger' | 'purple' | 'teal' | 'muted';

// Theme-aware dot colors — resolve against the mc-* CSS variables (dark + light).
const DOT_VAR: Record<DotColor, string> = {
	success: 'var(--mc-success)',
	indexing: 'var(--mc-indexing)',
	accent: 'var(--mc-accent)',
	danger: 'var(--mc-danger)',
	purple: 'var(--mc-purple)',
	teal: 'var(--mc-teal)',
	muted: 'var(--mc-muted)',
};

/** Small status indicator dot with optional glow + pulse. */
export function StatusDot({ color, glow = false, pulse = false, className }: { color: DotColor; glow?: boolean; pulse?: boolean; className?: string }) {
	const c = `hsl(${DOT_VAR[color]})`;
	return (
		<span
			className={cn('inline-block h-[7px] w-[7px] rounded-full', pulse && 'animate-meshpulse', className)}
			style={{ background: c, boxShadow: glow ? `0 0 8px hsl(${DOT_VAR[color]} / 0.5)` : undefined }}
		/>
	);
}

/**
 * The Meshify mark — a single traversal through five nodes that reads as an "M"
 * and as a path across a knowledge graph. White strokes/nodes so it sits on the
 * indigo→iris squircle lockup in either theme.
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

const MESH_GRADIENT = 'linear-gradient(135deg, hsl(var(--mc-accent)), hsl(var(--mc-purple)))';

/** The Meshify logo lockup: the mark inside an indigo→iris squircle. */
export function MeshLogo({ size = 27, className }: { size?: number; className?: string }) {
	return (
		<div
			className={cn('flex items-center justify-center', className)}
			style={{ width: size, height: size, borderRadius: size * 0.33, background: MESH_GRADIENT, boxShadow: 'var(--glow-accent)' }}
		>
			<MeshMark size={size * 0.66} />
		</div>
	);
}

/**
 * The "Mesh" (AI) avatar — the same squircle lockup marking AI-authored content.
 * `breathe` gives it a subtle glow pulse.
 */
export function MeshAvatar({ size = 28, breathe = false, className }: { size?: number; breathe?: boolean; className?: string }) {
	return (
		<div
			className={cn('flex flex-none items-center justify-center', breathe && 'animate-breathe', className)}
			style={{ width: size, height: size, borderRadius: size * 0.33, background: MESH_GRADIENT, boxShadow: 'var(--glow-accent)' }}
		>
			<MeshMark size={size * 0.66} />
		</div>
	);
}

/** Elevated surface card with a hairline border and a soft shadow. */
export function GlassCard({ children, className, glow = false }: { children: ReactNode; className?: string; glow?: boolean }) {
	return (
		<div className={cn('rounded-2xl border bg-mc-card shadow-e2', glow ? 'border-mc-accent/25' : 'border-mc-border', className)}>{children}</div>
	);
}

/** A highlighted card with a faint iris tint and a slow light sweep. */
export function BeamCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn('relative overflow-hidden rounded-2xl border border-mc-purple/25 bg-mc-card shadow-glow-purple', className)}>
			<div className="pointer-events-none absolute inset-y-0 left-0 w-[36%] animate-beam" style={{ background: 'linear-gradient(90deg,transparent,hsl(var(--mc-purple)/.1),transparent)' }} />
			<div className="relative">{children}</div>
		</div>
	);
}

/** A flat, low-elevation framed well for grouping content inside a page. */
export function Surface({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn('rounded-xl border border-mc-border bg-mc-surface/60', className)}>{children}</div>;
}

/** A metric tile — a mono label above an emphasized value. `accent` tints it. */
export function MetricCard({ label, children, accent = false, className }: { label: string; children: ReactNode; accent?: boolean; className?: string }) {
	return (
		<div className={cn('rounded-xl border p-4', accent ? 'border-mc-accent/25 bg-mc-accent/[.06]' : 'border-mc-border bg-mc-card shadow-e1', className)}>
			<div className="font-mono text-micro uppercase tracking-[.1em] text-mc-muted-2">{label}</div>
			<div className="mt-2">{children}</div>
		</div>
	);
}

/** Small monospace section label (uppercase, tracked) — "// PROJECT BRIEFING" etc. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn('font-mono text-micro uppercase tracking-[0.12em] text-mc-muted-2', className)}>{children}</span>;
}
