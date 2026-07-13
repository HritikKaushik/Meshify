import { cn } from '@/lib/utils';

/**
 * A calm light backdrop (Meshify Design Doc): a faint blueprint grid masked
 * toward the top and two soft blue/indigo radial glows, with optional orbital
 * rings + twinkling nodes. Purely decorative and pointer-events-none; sits
 * behind page content.
 */
export function Atmosphere({ stars = false, className }: { stars?: boolean; className?: string }) {
	return (
		<div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
			{/* grid */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage:
						'linear-gradient(rgba(16,24,40,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(16,24,40,.03) 1px,transparent 1px)',
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
						'radial-gradient(680px 340px at 16% -8%,rgba(79,141,251,.09),transparent 60%),radial-gradient(760px 460px at 104% 112%,rgba(99,102,241,.07),transparent 55%)',
				}}
			/>
			{stars && (
				<svg className="absolute inset-0 h-full w-full opacity-80" viewBox="0 0 1560 960" preserveAspectRatio="none">
					<title>Orbital rings</title>
					<ellipse cx="1230" cy="150" rx="520" ry="200" fill="none" stroke="rgba(26,115,232,.12)" strokeWidth="1" />
					<ellipse cx="1230" cy="150" rx="360" ry="130" fill="none" stroke="rgba(99,102,241,.10)" strokeWidth="1" />
					<circle cx="300" cy="120" r="1.6" fill="#4F8DFB" className="animate-twinkle" />
					<circle cx="620" cy="80" r="1.3" fill="#6366F1" opacity=".5" />
					<circle cx="980" cy="60" r="1.6" fill="#4F8DFB" className="animate-twinkle" style={{ animationDelay: '.5s' }} />
					<circle cx="1400" cy="240" r="1.4" fill="#6366F1" opacity=".5" className="animate-twinkle" style={{ animationDelay: '1s' }} />
					<circle cx="1120" cy="300" r="1.7" fill="#4F8DFB" opacity=".6" />
				</svg>
			)}
		</div>
	);
}
