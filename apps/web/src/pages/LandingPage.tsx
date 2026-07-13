import { Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { MeshLogo, MeshMark } from '@/components/mc/primitives';
import { HeroGeometric } from '@/components/landing/HeroGeometric';

/**
 * Landing page (Meshify Design Doc 4a) — a calm, light "engineering blueprint"
 * marketing surface. The hero is the reusable <HeroGeometric>; this page owns
 * the scroll (nav, product preview, trust, bento features, stats, flight-plan,
 * CTA, footer) and the Clerk wiring. Signed-in visitors skip to the workspace.
 */
export function LandingPage() {
	return (
		<>
			<SignedIn>
				<Navigate to="/home" replace />
			</SignedIn>
			<SignedOut>
				<div className="relative min-h-screen w-full overflow-x-hidden bg-mc-bg text-mc-text">
					<Nav />
					<HeroGeometric
						badge={
							<span className="inline-flex items-center gap-2 rounded-full border border-mc-purple/20 bg-white px-4 py-1.5 text-[12.5px] font-medium text-[#4F46E5] shadow-[0_4px_16px_rgba(79,110,240,.1)]">
								<span className="h-1.5 w-1.5 animate-breathe rounded-full bg-mc-purple shadow-[0_0_8px_rgba(99,102,241,.6)]" />
								Powered by RocketRide AI Infrastructure
							</span>
						}
						title={
							<>
								Engineering Knowledge
								<br />
								<span
									className="bg-clip-text text-transparent"
									style={{ backgroundImage: 'linear-gradient(100deg,#1A73E8,#4F8DFB 40%,#6366F1)' }}
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
									<button className="rounded-full bg-mc-accent px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_28px_rgba(26,115,232,.32)] transition-colors hover:bg-mc-accent-hi">
										Launch Mission Control
									</button>
								</SignUpButton>
								<SignInButton mode="modal">
									<button className="rounded-full border border-black/[.1] bg-white px-6 py-3.5 text-[15px] font-semibold text-mc-text shadow-[0_2px_10px_rgba(16,24,40,.05)] transition-colors hover:border-black/20">
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
		<nav className="relative z-20 flex items-center gap-4 border-b border-black/[.06] bg-white/72 px-5 py-4 backdrop-blur-[14px] sm:px-10">
			<div className="flex items-center gap-2.5">
				<MeshLogo size={28} />
				<span className="text-base font-semibold tracking-[-.01em]">Meshify</span>
				<span className="ml-1 hidden rounded-md border border-black/10 px-1.5 py-0.5 font-mono text-[9px] tracking-[.06em] text-mc-muted sm:inline">BY ROCKETRIDE</span>
			</div>
			<div className="hidden flex-1 items-center justify-center gap-7 text-[13.5px] font-medium text-mc-text-3 lg:flex">
				{['Platform', 'Repositories', 'Mesh AI', 'Docs', 'Pricing'].map((l) => (
					<span key={l} className="cursor-pointer transition-colors hover:text-mc-text">{l}</span>
				))}
			</div>
			<div className="ml-auto flex items-center gap-3">
				<SignInButton mode="modal">
					<span className="cursor-pointer text-[13.5px] font-medium text-mc-text-3 transition-colors hover:text-mc-text">Sign in</span>
				</SignInButton>
				<SignUpButton mode="modal">
					<button className="rounded-full bg-mc-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(26,115,232,.28)] transition-colors hover:bg-mc-accent-hi">
						Launch Mission Control
					</button>
				</SignUpButton>
			</div>
		</nav>
	);
}

/** A stylized light product still (not live data — clearly a marketing mock). */
function ProductPreview() {
	return (
		<div className="relative z-[5] mx-auto -mt-6 w-full max-w-5xl px-6 pb-8">
			<div className="overflow-hidden rounded-2xl border border-black/[.06] bg-white shadow-[0_30px_90px_rgba(16,24,40,.12),0_8px_24px_rgba(16,24,40,.06)]">
				<div className="flex items-center gap-2 border-b border-black/[.06] bg-[#FBFCFE] px-4 py-3">
					<span className="h-2.5 w-2.5 rounded-full bg-[#E4E7EE]" />
					<span className="h-2.5 w-2.5 rounded-full bg-[#E4E7EE]" />
					<span className="h-2.5 w-2.5 rounded-full bg-[#E4E7EE]" />
					<span className="ml-3 truncate font-mono text-[11px] text-mc-muted-2">meshify.rocketride.ai / payments-core</span>
					<span className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] text-mc-success sm:flex">
						<span className="h-[5px] w-[5px] rounded-full bg-mc-success" />ALL SYSTEMS NOMINAL
					</span>
				</div>
				<div className="grid h-[300px] grid-cols-1 sm:h-[340px] sm:grid-cols-[200px_1fr]">
					<div className="hidden flex-col gap-2 border-r border-black/[.06] bg-[#FAFBFD] p-4 sm:flex">
						<div className="rounded-full bg-mc-accent px-3 py-2 text-center text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(26,115,232,.24)]">+ New Conversation</div>
						<div className="mt-2 font-mono text-[9px] tracking-[.1em] text-mc-muted-2">PINNED</div>
						<div className="rounded-lg bg-mc-accent/[.08] px-2.5 py-1.5 text-xs font-medium text-mc-accent-lo">Refund retry logic</div>
						<div className="px-2.5 py-1.5 text-xs text-mc-text-3">Webhook idempotency</div>
						<div className="px-2.5 py-1.5 text-xs text-mc-text-3">ADR-027 rollout</div>
					</div>
					<div className="flex flex-col gap-3.5 p-6">
						<div className="flex justify-end">
							<div className="rounded-[14px] rounded-br-md bg-[#EEF2FB] px-3.5 py-2.5 text-[13px] text-mc-text-2">Who gets paged on a MANUAL_REVIEW refund?</div>
						</div>
						<div className="flex gap-2.5">
							<MeshMarkAvatar />
							<div className="flex-1">
								<div className="rounded-[14px] rounded-tl-md bg-[#F4F6FA] px-3.5 py-3 text-[13px] leading-relaxed text-mc-text-2">
									The <strong className="font-semibold text-mc-text">on-call payments engineer</strong>, via the escalation policy in{' '}
									<span className="font-mono text-[11.5px] text-mc-accent">retry_policy.rs</span>.
								</div>
								<div className="mt-2 flex flex-wrap gap-1.5">
									<Chip tint="rgba(26,115,232,.08)" color="#1A73E8">state_machine.rs</Chip>
									<Chip tint="rgba(99,102,241,.08)" color="#4F46E5">refund-runbook.md</Chip>
									<Chip tint="rgba(30,158,106,.08)" color="#1E9E6A">88% confident</Chip>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function MeshMarkAvatar() {
	return (
		<div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg shadow-[0_4px_12px_rgba(79,110,240,.3)]" style={{ background: 'linear-gradient(135deg,#4F8DFB,#6366F1)' }}>
			<MeshMark size={17} />
		</div>
	);
}

function Chip({ children, tint, color }: { children: string; tint: string; color: string }) {
	return (
		<span className="rounded-md px-2 py-1 font-mono text-[10px] font-medium" style={{ background: tint, color }}>
			{children}
		</span>
	);
}

function TrustBand() {
	return (
		<section className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 border-y border-black/[.06] bg-[#FBFCFE] px-6 py-8 text-center">
			<span className="font-mono text-[11px] tracking-[.1em] text-mc-muted-2">TRUSTED BY ENGINEERING TEAMS AT</span>
			<div className="flex flex-wrap justify-center gap-x-11 gap-y-3 text-[17px] font-semibold tracking-[-.01em] text-[#B4BAC8]">
				{['Northwind', 'Halcyon', 'Vector Labs', 'Fathom', 'Aperture'].map((n) => <span key={n}>{n}</span>)}
			</div>
		</section>
	);
}

function Features() {
	return (
		<section className="relative flex flex-col gap-11 px-6 py-20 sm:px-10">
			<div className="relative flex flex-col items-center gap-3.5 text-center">
				<span className="font-mono text-[11px] tracking-[.14em] text-mc-accent">THE WORKSPACE</span>
				<h2 className="max-w-[20ch] text-3xl font-semibold leading-[1.08] tracking-[-.03em] text-mc-text sm:text-[46px]">One calm surface for your entire engineering org</h2>
				<p className="max-w-[56ch] text-[16px] leading-relaxed text-mc-text-3">Mesh indexes every repo and document, then answers with citations and confidence — so nobody re-learns the codebase from scratch.</p>
			</div>
			<div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 gap-[18px] md:grid-cols-3 md:grid-rows-2">
				{/* Featured — chat */}
				<div className="flex flex-col gap-4 rounded-[22px] border border-mc-accent/[.12] bg-gradient-to-b from-[#F4F8FF] to-white p-[30px] shadow-[0_10px_34px_rgba(16,24,40,.06)] md:row-span-2">
					<FeatureIcon gradient>✦</FeatureIcon>
					<div className="text-[22px] font-semibold tracking-[-.02em] text-mc-text">Chat grounded in your knowledge</div>
					<p className="text-[14px] leading-relaxed text-mc-text-3">Ask anything across code and docs. Every answer streams with citations, confidence, and jump-to-source — a calm reading experience, tuned for engineering.</p>
					<div className="mt-auto rounded-2xl border border-black/[.06] bg-white p-3.5 shadow-[0_6px_18px_rgba(16,24,40,.05)]">
						<div className="text-[13px] leading-relaxed text-mc-text-2">
							Refunds route to <span className="font-mono text-[11.5px] text-mc-accent">MANUAL_REVIEW</span> when <span className="font-mono text-[11.5px]">attempts&nbsp;&gt;&nbsp;3</span>
						</div>
						<div className="mt-2.5 flex gap-1.5">
							<Chip tint="rgba(26,115,232,.08)" color="#1A73E8">state_machine.rs</Chip>
							<Chip tint="rgba(30,158,106,.08)" color="#1E9E6A">88%</Chip>
						</div>
					</div>
				</div>
				{/* Index repositories */}
				<div className="flex flex-col gap-3 rounded-[22px] border border-black/[.06] bg-white p-[26px] shadow-[0_10px_30px_rgba(16,24,40,.05)]">
					<FeatureIcon tint="rgba(26,115,232,.1)" color="#1A73E8">◉</FeatureIcon>
					<div className="text-[18px] font-semibold tracking-[-.01em] text-mc-text">Index repositories</div>
					<p className="text-[13.5px] leading-relaxed text-mc-text-3">Point Mesh at a repo. It maps files and embeds symbols as coverage rises visibly.</p>
				</div>
				{/* Generate documentation */}
				<div className="flex flex-col gap-3 rounded-[22px] border border-black/[.06] bg-white p-[26px] shadow-[0_10px_30px_rgba(16,24,40,.05)]">
					<FeatureIcon tint="rgba(99,102,241,.1)" color="#6366F1">✎</FeatureIcon>
					<div className="text-[18px] font-semibold tracking-[-.01em] text-mc-text">Generate documentation</div>
					<p className="text-[13.5px] leading-relaxed text-mc-text-3">Turn indexed knowledge into runbooks and ADRs, grounded in real source.</p>
				</div>
				{/* Semantic search — wide */}
				<div className="flex items-center gap-5 rounded-[22px] border border-mc-purple/[.12] bg-gradient-to-r from-[#F5F4FF] to-white p-[26px] shadow-[0_10px_30px_rgba(16,24,40,.05)] md:col-span-2">
					<div className="flex-1">
						<div className="mb-2 text-[18px] font-semibold tracking-[-.01em] text-mc-text">Semantic search across everything</div>
						<p className="text-[13.5px] leading-relaxed text-mc-text-3">Meaning, not keywords — spanning code, docs, and past conversations in one query.</p>
					</div>
					<div className="hidden max-w-[200px] flex-wrap gap-2 sm:flex">
						{['code', 'docs', 'conversations'].map((t) => (
							<span key={t} className="rounded-full border border-black/[.08] bg-white px-2.5 py-1.5 text-[11px] font-medium text-mc-text-3 shadow-[0_2px_8px_rgba(16,24,40,.04)]">{t}</span>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function FeatureIcon({ children, gradient, tint, color }: { children: string; gradient?: boolean; tint?: string; color?: string }) {
	return (
		<div
			className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
			style={gradient
				? { background: 'linear-gradient(135deg,#4F8DFB,#6366F1)', color: '#fff', boxShadow: '0 8px 20px rgba(79,110,240,.3)' }
				: { background: tint, color }}
		>
			{children}
		</div>
	);
}

const STATS = [
	{ v: '2.4B', label: 'lines of code indexed', grad: 'linear-gradient(100deg,#1A73E8,#6366F1)' },
	{ v: '120ms', label: 'median cited answer', color: '#12141A' },
	{ v: '94%', label: 'knowledge coverage', color: '#1E9E6A' },
	{ v: '40k+', label: 'engineers onboarded', grad: 'linear-gradient(100deg,#6366F1,#4F8DFB)' },
];

function StatsBand() {
	return (
		<section className="grid grid-cols-2 gap-6 border-y border-black/[.06] bg-gradient-to-b from-white to-[#F4F7FE] px-6 py-14 text-center sm:px-10 lg:grid-cols-4">
			{STATS.map((s) => (
				<div key={s.label}>
					<div className="text-[38px] font-semibold tracking-[-.03em] sm:text-[48px]" style={s.grad ? { backgroundImage: s.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: s.color }}>{s.v}</div>
					<div className="mt-1 text-[13px] text-mc-text-3">{s.label}</div>
				</div>
			))}
		</section>
	);
}

const STEPS = [
	{ n: '01', title: 'Connect', body: 'Link repositories and drop in docs. Mesh begins indexing immediately.', color: '#1A73E8' },
	{ n: '02', title: 'Understand', body: 'Coverage rises as symbols, structure, and history are embedded.', color: '#6366F1' },
	{ n: '03', title: 'Ask Mesh', body: 'Get cited, confidence-scored answers and auto-drafted documentation.', color: '#1A73E8' },
];

function FlightPlan() {
	return (
		<section className="flex flex-col gap-10 px-6 py-20 sm:px-10">
			<div className="flex flex-col items-center gap-3 text-center">
				<span className="font-mono text-[11px] tracking-[.14em] text-mc-accent">FLIGHT PLAN</span>
				<h2 className="text-3xl font-semibold leading-[1.1] tracking-[-.03em] text-mc-text sm:text-[42px]">From repo to answer in three moves</h2>
			</div>
			<div className="relative mx-auto grid w-full max-w-4xl grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-0">
				<div className="pointer-events-none absolute left-[16%] right-[16%] top-[28px] hidden h-0.5 sm:block" style={{ background: 'linear-gradient(90deg,transparent,rgba(26,115,232,.3),rgba(99,102,241,.3),transparent)' }} />
				{STEPS.map((s) => (
					<div key={s.n} className="relative flex flex-col items-center gap-3 px-6 text-center">
						<div className="flex h-14 w-14 items-center justify-center rounded-full bg-white font-mono text-[16px] font-semibold" style={{ border: `1px solid ${s.color}40`, color: s.color, boxShadow: `0 8px 22px ${s.color}24` }}>{s.n}</div>
						<div className="text-[18px] font-semibold text-mc-text">{s.title}</div>
						<p className="text-[13.5px] leading-relaxed text-mc-text-3">{s.body}</p>
					</div>
				))}
			</div>
		</section>
	);
}

function CtaBand() {
	return (
		<section className="relative mx-6 mb-11 overflow-hidden rounded-[28px] px-6 py-[76px] text-center sm:mx-10" style={{ background: 'linear-gradient(135deg,#1A73E8,#4F6BE8 55%,#6366F1)', boxShadow: '0 30px 80px rgba(52,86,220,.32)' }}>
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)',
					backgroundSize: '40px 40px',
					maskImage: 'radial-gradient(90% 120% at 50% 0%,#000,transparent)',
					WebkitMaskImage: 'radial-gradient(90% 120% at 50% 0%,#000,transparent)',
				}}
			/>
			<h2 className="relative mx-auto max-w-[22ch] text-3xl font-semibold leading-[1.08] tracking-[-.03em] text-white sm:text-[46px]">Where AI understands your entire engineering org</h2>
			<p className="relative mx-auto mt-5 max-w-[48ch] text-base text-white/85">Launch Mission Control and watch your codebase become answerable.</p>
			<div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
				<SignUpButton mode="modal">
					<button className="rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold text-mc-accent-lo shadow-[0_10px_30px_rgba(0,0,0,.18)] transition-transform hover:-translate-y-0.5">Launch Mission Control</button>
				</SignUpButton>
				<SignInButton mode="modal">
					<button className="rounded-full border border-white/35 bg-white/[.14] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/25">Explore Demo</button>
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
			<footer className="flex flex-col gap-10 border-t border-black/[.06] bg-[#FBFCFE] px-6 py-10 sm:flex-row sm:gap-10 sm:px-10">
				<div className="flex max-w-[260px] flex-col gap-2.5">
					<div className="flex items-center gap-2.5"><MeshLogo size={24} /><span className="text-sm font-semibold">Meshify</span></div>
					<p className="text-[12.5px] leading-relaxed text-mc-muted">The intelligent engineering workspace, built on RocketRide AI infrastructure.</p>
				</div>
				<div className="grid flex-1 grid-cols-2 gap-6 sm:grid-cols-4">
					{FOOTER_COLS.map(([head, items]) => (
						<div key={head}>
							<div className="mb-2 font-mono text-[11px] tracking-[.06em] text-mc-muted-2">{head}</div>
							<div className="flex flex-col gap-1.5 text-[12.5px] text-mc-text-3">{items.map((i) => <span key={i} className="cursor-pointer hover:text-mc-text">{i}</span>)}</div>
						</div>
					))}
				</div>
			</footer>
			<div className="flex flex-col gap-2 border-t border-black/[.06] px-6 py-5 text-center font-mono text-[11.5px] text-mc-muted-2 sm:flex-row sm:justify-between sm:px-10 sm:text-left">
				<span>© 2026 Rocketride, Inc.</span>
				<span>SOC 2 Type II · ISO 27001</span>
			</div>
		</>
	);
}
