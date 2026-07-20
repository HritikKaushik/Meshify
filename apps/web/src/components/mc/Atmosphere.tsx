import { cn } from '@/lib/utils';

/**
 * A calm, theme-aware backdrop: a faint blueprint grid masked toward the top and
 * two soft accent/iris radial glows, with optional orbital rings + twinkling
 * nodes. Purely decorative + pointer-events-none; sits behind page content.
 * Colors resolve from the mc-* CSS variables so it reads correctly in dark+light.
 */
export function Atmosphere({ stars = false, className }: { stars?: boolean; className?: string }) {
	return (
		<div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
			{/* grid */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage:
						'linear-gradient(hsl(var(--mc-text)/.04) 1px,transparent 1px),linear-gradient(90deg,hsl(var(--mc-text)/.04) 1px,transparent 1px)',
					backgroundSize: '46px 46px',
					maskImage: 'radial-gradient(120% 100% at 60% 0%,#000 26%,transparent 82%)',
					WebkitMaskImage: 'radial-gradient(120% 100% at 60% 0%,#000 26%,transparent 82%)',
				}}
			/>
			{/* radial glows */}
			<div
				className="absolute inset-0"
				style={{
					background:
						'radial-gradient(680px 340px at 16% -8%,hsl(var(--mc-accent)/.12),transparent 60%),radial-gradient(760px 460px at 104% 112%,hsl(var(--mc-purple)/.1),transparent 55%)',
				}}
			/>
			{stars && (
				<svg className="absolute inset-0 h-full w-full opacity-80" viewBox="0 0 1560 960" preserveAspectRatio="none">
					<title>Orbital rings</title>
					<ellipse cx="1230" cy="150" rx="520" ry="200" fill="none" stroke="hsl(var(--mc-accent)/.14)" strokeWidth="1" />
					<ellipse cx="1230" cy="150" rx="360" ry="130" fill="none" stroke="hsl(var(--mc-purple)/.12)" strokeWidth="1" />
					<circle cx="300" cy="120" r="1.6" fill="hsl(var(--mc-accent))" className="animate-twinkle" />
					<circle cx="620" cy="80" r="1.3" fill="hsl(var(--mc-purple))" opacity=".5" />
					<circle cx="980" cy="60" r="1.6" fill="hsl(var(--mc-accent))" className="animate-twinkle" style={{ animationDelay: '.5s' }} />
					<circle cx="1400" cy="240" r="1.4" fill="hsl(var(--mc-purple))" opacity=".5" className="animate-twinkle" style={{ animationDelay: '1s' }} />
					<circle cx="1120" cy="300" r="1.7" fill="hsl(var(--mc-accent))" opacity=".6" />
				</svg>
			)}
		</div>
	);
}
