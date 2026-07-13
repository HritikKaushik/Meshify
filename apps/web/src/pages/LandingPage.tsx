import { Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { MeshLogo } from '@/components/mc/primitives';
import { HeroGeometric } from '@/components/landing/HeroGeometric';

/**
 * Landing page (design 3a) — "Mission Control inside an engineering blueprint".
 * The hero is the reusable <HeroGeometric>; this page owns the marketing scroll
 * (nav, product preview, trust, features, stats, flight-plan, CTA, footer) and
 * the Clerk wiring. Signed-in visitors skip straight to the workspace.
 */
export function LandingPage() {
	return (
		<>
			<SignedIn>
				<Navigate to="/home" replace />
			</SignedIn>
			<SignedOut>
				<div className="relative min-h-screen w-full overflow-x-hidden bg-[#07070A] text-mc-text">
					<Nav />
					<HeroGeometric
						badge={
							<span className="inline-flex items-center gap-2 rounded-full border border-mc-accent-hi/30 bg-white/[.04] px-4 py-1.5 text-[12.5px] font-medium text-mc-accent-hi shadow-[0_0_24px_rgba(227,154,76,.14)]">
								<span className="h-1.5 w-1.5 animate-breathe rounded-full bg-mc-accent shadow-[0_0_10px_#E39A4C]" />
								Powered by RocketRide
							</span>
						}
						title={
							<>
								Engineering Knowledge
								<br />
								<span
									className="bg-clip-text text-transparent"
									style={{ backgroundImage: 'linear-gradient(90deg,#F0B26A,#E39A4C 42%,#6E9BE8)' }}
								>
									at Rocket Speed
								</span>
							</>
						}
						subtitle="Build intelligent knowledge workspaces that understand your repositories, documents and engineering discussions."
						footnote="SOC 2 Type II · self-host ready · no credit card required"
						actions={
							<>
								<SignUpButton mode="modal">
									<button className="group relative overflow-hidden rounded-xl p-[1.5px] shadow-[0_0_30px_rgba(227,154,76,.3)]" style={{ background: 'linear-gradient(120deg,#F0B26A,#B96F2E 45%,#6E9BE8 90%)' }}>
										<span className="pointer-events-none absolute inset-y-0 left-0 w-[40%] animate-beam" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)' }} />
										<span className="relative block rounded-[10.5px] bg-mc-accent px-7 py-3.5 text-[15px] font-semibold text-mc-bg transition-colors group-hover:bg-mc-accent-hi">
											Launch Mission Control ↗
										</span>
									</button>
								</SignUpButton>
								<SignInButton mode="modal">
									<button className="rounded-xl border border-white/[.14] bg-white/[.05] px-6 py-3.5 text-[15px] font-semibold text-mc-text backdrop-blur-[8px] transition-colors hover:border-white/25">
										Explore Demo
									</button>
								</SignInButton>
							</>
						}
					/>

					<ProductPreview />
					<TrustBand />
					<Features />
					<StatsBand />
					<FlightPlan />
					<CtaBand />
					<Footer />
				</div>
			</SignedOut>
		</>
	);
}

function Nav() {
	return (
		<nav className="relative z-20 flex items-center gap-4 border-b border-white/[.06] bg-[rgba(7,7,10,.7)] px-5 py-4 backdrop-blur-[12px] sm:px-10">
			<div className="flex items-center gap-2.5">
				<MeshLogo size={28} />
				<span className="text-base font-semibold tracking-[-.01em]">Meshify</span>
				<span className="ml-1 hidden rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[9px] tracking-[.08em] text-mc-muted-2 sm:inline">BY ROCKETRIDE</span>
			</div>
			<div className="hidden flex-1 items-center justify-center gap-7 text-[13.5px] font-medium text-mc-text-2 lg:flex">
				{['Platform', 'Repositories', 'Mesh AI', 'Docs', 'Pricing'].map((l) => (
					<span key={l} className="cursor-pointer transition-colors hover:text-mc-text">{l}</span>
				))}
			</div>
			<div className="ml-auto flex items-center gap-3">
				<SignInButton mode="modal">
					<span className="cursor-pointer text-[13.5px] font-medium text-mc-text-2 transition-colors hover:text-mc-text">Sign in</span>
				</SignInButton>
				<SignUpButton mode="modal">
					<button className="rounded-lg bg-mc-accent px-4 py-2 text-[13px] font-semibold text-mc-bg shadow-[0_0_20px_rgba(227,154,76,.28)] transition-colors hover:bg-mc-accent-hi">
						Launch Mission Control
					</button>
				</SignUpButton>
			</div>
		</nav>
	);
}

/** A stylized product still (not live data — clearly a marketing mock). */
function ProductPreview() {
	return (
		<div className="relative z-[5] mx-auto -mt-6 w-full max-w-5xl px-6 pb-8">
			<div className="rounded-2xl p-[1px] shadow-[0_40px_120px_rgba(0,0,0,.6),0_0_60px_rgba(227,154,76,.12)]" style={{ background: 'linear-gradient(160deg,rgba(240,178,106,.4),rgba(255,255,255,.06) 30%,rgba(110,155,232,.3))' }}>
				<div className="overflow-hidden rounded-[15px] border border-white/[.04] bg-[#0A0A0E]">
					<div className="flex items-center gap-2 border-b border-white/[.06] bg-white/[.02] px-4 py-3">
						<span className="h-2.5 w-2.5 rounded-full bg-[#3A3A42]" />
						<span className="h-2.5 w-2.5 rounded-full bg-[#3A3A42]" />
						<span className="h-2.5 w-2.5 rounded-full bg-[#3A3A42]" />
						<span className="ml-3 truncate font-mono text-[11px] text-mc-muted">meshify.rocketride.ai / payments-core / mission-control</span>
						<span className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] text-mc-success sm:flex">
							<span className="h-[5px] w-[5px] rounded-full bg-mc-success shadow-[0_0_6px_#55C784]" />ALL SYSTEMS NOMINAL
						</span>
					</div>
					<div className="grid h-[300px] grid-cols-1 sm:h-[340px] sm:grid-cols-[180px_1fr_200px]">
						<div className="hidden flex-col gap-2 border-r border-white/[.05] bg-white/[.01] p-4 sm:flex">
							<div className="rounded-lg bg-mc-accent px-3 py-2 text-center text-[13px] font-semibold text-mc-bg">+ New Conversation</div>
							<div className="my-1.5 h-px bg-white/[.06]" />
							<div className="font-mono text-[9px] tracking-[.1em] text-mc-muted-2">PINNED</div>
							<div className="rounded-md bg-mc-accent/10 px-2 py-1.5 text-xs text-mc-text">Refund retry logic</div>
							<div className="mt-1.5 font-mono text-[9px] tracking-[.1em] text-mc-muted-2">RECENT</div>
							<div className="px-2 py-1.5 text-xs text-mc-text-3">Webhook idempotency</div>
							<div className="px-2 py-1.5 text-xs text-mc-text-3">ADR-027 rollout</div>
						</div>
						<div className="flex flex-col gap-3.5 p-5">
							<div className="font-mono text-[10px] tracking-[.16em] text-mc-accent">// PROJECT BRIEFING</div>
							<div className="text-[22px] font-semibold tracking-[-.02em]">payments-core</div>
							<div className="flex gap-2.5">
								{[['COVERAGE', '86%', 'text-mc-success'], ['REPOS', '6', ''], ['INDEXING', '3', 'text-mc-indexing']].map(([k, v, c]) => (
									<div key={k} className="flex-1 rounded-lg border border-white/[.07] bg-white/[.02] p-3">
										<div className="font-mono text-[10px] text-mc-muted">{k}</div>
										<div className={`mt-1 text-[21px] font-semibold ${c}`}>{v}</div>
									</div>
								))}
							</div>
							<div className="rounded-[10px] border border-mc-accent/20 p-3.5" style={{ background: 'linear-gradient(120deg,rgba(227,154,76,.08),transparent)' }}>
								<div className="flex items-center gap-1.5 text-[11px] font-medium text-mc-accent-hi">
									<span>✦</span>Mesh noticed 4 undocumented endpoints in <span className="font-mono">billing/webhooks</span>
								</div>
							</div>
						</div>
						<div className="hidden flex-col gap-2.5 border-l border-white/[.05] bg-white/[.01] p-4 sm:flex">
							<div className="font-mono text-[9px] tracking-[.1em] text-mc-muted-2">INDEXING JOBS</div>
							{[['api-gateway', 72], ['ml-inference', 41]].map(([n, p]) => (
								<div key={n as string} className="flex flex-col gap-1.5">
									<div className="flex justify-between text-[11px] text-mc-text-2"><span>{n}</span><span className="text-mc-indexing">{p}%</span></div>
									<div className="h-1 overflow-hidden rounded bg-white/[.06]"><div className="h-full bg-mc-indexing" style={{ width: `${p}%` }} /></div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function TrustBand() {
	return (
		<section className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 border-y border-white/[.06] bg-white/[.008] px-6 py-8 text-center">
			<span className="font-mono text-[11px] tracking-[.12em] text-mc-muted-2">TRUSTED BY ENGINEERING TEAMS AT</span>
			<div className="flex flex-wrap justify-center gap-x-11 gap-y-3 text-[17px] font-semibold tracking-[-.01em] text-[#4A4A52]">
				{['Northwind', 'Halcyon', 'Vector Labs', 'Fathom', 'Aperture'].map((n) => <span key={n}>{n}</span>)}
			</div>
		</section>
	);
}

const FEATURES = [
	{ icon: '❂', color: '#F0B26A', tint: 'rgba(227,154,76,', title: 'Index repositories', body: 'Point Mesh at a repo. It maps files, embeds symbols, and tracks per-file indexing state as coverage rises visibly.', tags: ['AST-aware', 'incremental'] },
	{ icon: '✦', color: '#6E9BE8', tint: 'rgba(110,155,232,', title: 'Chat with your knowledge', body: 'Ask anything across code and docs. Every answer comes with citations, confidence scores, and jump-to-source.', tags: ['cited', 'confidence-scored'], featured: true },
	{ icon: '✎', color: '#8B7CC9', tint: 'rgba(139,124,201,', title: 'Generate documentation', body: 'Turn indexed knowledge into runbooks, ADRs, and API docs — drafted by Mesh, grounded in real source.', tags: ['runbooks', 'ADRs'] },
];

function Features() {
	return (
		<section className="relative flex flex-col gap-11 px-6 py-20 sm:px-10">
			<div className="relative flex flex-col items-center gap-3.5 text-center">
				<span className="font-mono text-[11px] tracking-[.16em] text-mc-accent">// THE WORKSPACE</span>
				<h2 className="max-w-[20ch] text-3xl font-semibold leading-[1.1] tracking-[-.03em] sm:text-[44px]">One intelligent surface for your entire engineering org</h2>
				<p className="max-w-[56ch] text-[15.5px] leading-relaxed text-mc-text-3">Mesh indexes every repo and document, then answers with citations and confidence — so nobody re-learns the codebase from scratch.</p>
			</div>
			<div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
				{FEATURES.map((f) => (
					<div
						key={f.title}
						className="flex flex-col gap-3.5 rounded-2xl border p-7"
						style={{ borderColor: f.featured ? `${f.tint}.2)` : 'rgba(255,255,255,.08)', background: `linear-gradient(180deg,${f.featured ? `${f.tint}.06)` : 'rgba(255,255,255,.03)'},rgba(255,255,255,.008))` }}
					>
						<div className="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style={{ background: `${f.tint}.12)`, border: `1px solid ${f.tint}.26)`, color: f.color }}>{f.icon}</div>
						<div className="text-[19px] font-semibold tracking-[-.01em]">{f.title}</div>
						<p className="text-[13.5px] leading-relaxed text-mc-text-3">{f.body}</p>
						<div className="mt-auto flex flex-wrap gap-1.5 pt-2">
							{f.tags.map((t) => <span key={t} className="rounded bg-white/[.05] px-2 py-1 font-mono text-[10px] text-mc-text-2">{t}</span>)}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

const STATS = [
	{ v: '2.4B', label: 'lines of code indexed', grad: 'linear-gradient(90deg,#F0B26A,#E39A4C)' },
	{ v: '120ms', label: 'median cited answer', color: '#F2F2F4' },
	{ v: '94%', label: 'knowledge coverage', color: '#55C784' },
	{ v: '40k+', label: 'engineers onboarded', grad: 'linear-gradient(90deg,#6E9BE8,#8B7CC9)' },
];

function StatsBand() {
	return (
		<section className="grid grid-cols-2 gap-6 border-y border-white/[.06] px-6 py-14 text-center sm:px-10 lg:grid-cols-4" style={{ background: 'radial-gradient(700px 300px at 50% 50%,rgba(227,154,76,.06),transparent)' }}>
			{STATS.map((s) => (
				<div key={s.label}>
					<div className="text-[38px] font-semibold tracking-[-.03em] sm:text-[46px]" style={s.grad ? { backgroundImage: s.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: s.color }}>{s.v}</div>
					<div className="mt-1 text-[13px] text-mc-text-3">{s.label}</div>
				</div>
			))}
		</section>
	);
}

const STEPS = [
	{ n: '01', title: 'Connect', body: 'Link repositories and drop in docs. Mesh begins indexing immediately.', color: '#E39A4C' },
	{ n: '02', title: 'Understand', body: 'Coverage rises as symbols, structure, and history are embedded.', color: '#6E9BE8' },
	{ n: '03', title: 'Ask Mesh', body: 'Get cited, confidence-scored answers and auto-drafted documentation.', color: '#8B7CC9' },
];

function FlightPlan() {
	return (
		<section className="flex flex-col gap-10 px-6 py-20 sm:px-10">
			<div className="flex flex-col items-center gap-3 text-center">
				<span className="font-mono text-[11px] tracking-[.16em] text-mc-accent">// FLIGHT PLAN</span>
				<h2 className="text-3xl font-semibold leading-[1.1] tracking-[-.03em] sm:text-[40px]">From repo to answer in three moves</h2>
			</div>
			<div className="relative mx-auto grid w-full max-w-4xl grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-0">
				<div className="pointer-events-none absolute left-[16%] right-[16%] top-[26px] hidden h-px sm:block" style={{ background: 'linear-gradient(90deg,transparent,rgba(227,154,76,.4),rgba(110,155,232,.4),transparent)' }} />
				{STEPS.map((s) => (
					<div key={s.n} className="relative flex flex-col items-center gap-3 px-6 text-center">
						<div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-mc-card font-mono text-[15px] font-semibold" style={{ border: `1px solid ${s.color}66`, color: s.color, boxShadow: `0 0 24px ${s.color}33` }}>{s.n}</div>
						<div className="text-[17px] font-semibold">{s.title}</div>
						<p className="text-[13px] leading-relaxed text-mc-text-3">{s.body}</p>
					</div>
				))}
			</div>
		</section>
	);
}

function CtaBand() {
	return (
		<section className="relative mx-6 mb-10 overflow-hidden rounded-3xl border border-mc-accent/20 px-6 py-16 text-center sm:mx-10" style={{ background: 'radial-gradient(900px 400px at 50% 120%,rgba(227,154,76,.16),transparent),linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01))' }}>
			<h2 className="relative mx-auto max-w-[20ch] text-3xl font-semibold leading-[1.08] tracking-[-.03em] sm:text-[48px]">This is where AI understands your entire engineering org</h2>
			<p className="relative mx-auto mt-5 max-w-[50ch] text-base text-mc-text-2">Launch Mission Control and watch your codebase become answerable.</p>
			<div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
				<SignUpButton mode="modal">
					<button className="rounded-xl bg-mc-accent px-8 py-3.5 text-[15px] font-semibold text-mc-bg shadow-[0_0_34px_rgba(227,154,76,.32)] transition-colors hover:bg-mc-accent-hi">Launch Mission Control ↗</button>
				</SignUpButton>
				<SignInButton mode="modal">
					<button className="rounded-xl border border-white/[.14] bg-white/[.05] px-6 py-3.5 text-[15px] font-semibold text-mc-text transition-colors hover:border-white/25">Explore Demo</button>
				</SignInButton>
			</div>
		</section>
	);
}

const FOOTER_COLS = [
	['PRODUCT', ['Mission Control', 'Mesh Chat', 'Repositories', 'Documents']],
	['PLATFORM', ['Indexing', 'Citations', 'Self-host', 'Security']],
	['COMPANY', ['About', 'Careers', 'Blog', 'Contact']],
	['RESOURCES', ['Docs', 'Changelog', 'Status', 'API']],
] as const;

function Footer() {
	return (
		<>
			<footer className="flex flex-col gap-10 border-t border-white/[.06] bg-white/[.008] px-6 py-10 sm:flex-row sm:gap-10 sm:px-10">
				<div className="flex max-w-[260px] flex-col gap-2.5">
					<div className="flex items-center gap-2.5"><MeshLogo size={24} /><span className="text-sm font-semibold">Meshify</span></div>
					<p className="text-[12.5px] leading-relaxed text-mc-muted-2">The intelligent engineering workspace, built on RocketRide AI infrastructure.</p>
				</div>
				<div className="grid flex-1 grid-cols-2 gap-6 sm:grid-cols-4">
					{FOOTER_COLS.map(([head, items]) => (
						<div key={head}>
							<div className="mb-2 font-mono text-[11px] tracking-[.08em] text-mc-muted">{head}</div>
							<div className="flex flex-col gap-1.5 text-[12.5px] text-mc-text-3">{items.map((i) => <span key={i} className="cursor-pointer hover:text-mc-text-2">{i}</span>)}</div>
						</div>
					))}
				</div>
			</footer>
			<div className="flex flex-col gap-2 border-t border-white/[.06] px-6 py-5 text-center font-mono text-[11.5px] text-[#4A4A52] sm:flex-row sm:justify-between sm:px-10 sm:text-left">
				<span>© 2026 Rocketride, Inc.</span>
				<span>SOC 2 Type II · ISO 27001</span>
			</div>
		</>
	);
}
