import { cn } from '@/lib/utils';

/**
 * The "Mission Control" atmosphere backdrop from the Meshify design doc (2a/2b/2c):
 * a faint dot/line grid masked toward the top, two soft radial glows (amber +
 * blue), and optional orbital rings + twinkling stars. Purely decorative and
 * pointer-events-none; sits behind page content at z-0.
 */
export function Atmosphere({ stars = false, className }: { stars?: boolean; className?: string }) {
	return (
		<div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
			{/* grid */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage:
						'linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px)',
					backgroundSize: '34px 34px',
					maskImage: 'radial-gradient(120% 100% at 60% 0%,#000 30%,transparent 90%)',
					WebkitMaskImage: 'radial-gradient(120% 100% at 60% 0%,#000 30%,transparent 90%)',
				}}
			/>
			{/* radial glows */}
			<div
				className="absolute inset-0"
				style={{
					background:
						'radial-gradient(680px 340px at 16% -8%,rgba(227,154,76,.11),transparent 60%),radial-gradient(760px 460px at 104% 112%,rgba(110,155,232,.09),transparent 55%)',
				}}
			/>
			{stars && (
				<svg className="absolute inset-0 h-full w-full opacity-50" viewBox="0 0 1560 960" preserveAspectRatio="none">
					<title>Orbital rings</title>
					<ellipse cx="1230" cy="150" rx="520" ry="200" fill="none" stroke="rgba(227,154,76,.16)" strokeWidth="1" />
					<ellipse cx="1230" cy="150" rx="360" ry="130" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
					<circle cx="300" cy="120" r="1.4" fill="#E39A4C" className="animate-twinkle" />
					<circle cx="620" cy="80" r="1.2" fill="#fff" opacity=".5" />
					<circle cx="980" cy="60" r="1.5" fill="#6E9BE8" className="animate-twinkle" style={{ animationDelay: '.5s' }} />
					<circle cx="1400" cy="240" r="1.3" fill="#fff" opacity=".4" className="animate-twinkle" style={{ animationDelay: '1s' }} />
					<circle cx="1120" cy="300" r="1.6" fill="#E39A4C" opacity=".7" />
				</svg>
			)}
		</div>
	);
}
