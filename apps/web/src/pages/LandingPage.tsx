import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { ArrowRight, Menu, X, Sparkles, GitBranch, FileText, Search, MessageSquare } from 'lucide-react';
import { MeshLogo, MeshMark, Kicker } from '@/components/mc/primitives';
import { Atmosphere } from '@/components/mc/Atmosphere';
import { AnimatedGroup } from '@/components/ui/animated-group';
import { Reveal } from '@/components/mc/motion';
import { cn } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Landing page — a premium dark "engineering knowledge platform" marketing
 * surface (dark-first, theme tokens throughout). Structure inspired by the
 * Tailark hero: a scroll-shrinking nav, blur-in animated reveals, an
 * announcement pill, a dual CTA, a framed product still and a customer strip.
 * Signed-in visitors skip straight to the workspace.
 */
export function LandingPage() {
	return (
		<>
			<SignedIn>
				<Navigate to="/home" replace />
			</SignedIn>
			<SignedOut>
				<div className="relative min-h-screen w-full overflow-x-hidden bg-mc-bg text-mc-text">
					<HeroHeader />
					<Hero />
					<Logos />
					<Features />
					<Stats />
					<FlightPlan />
					<Footer />
				</div>
			</SignedOut>
		</>
	);
}

/* --------------------------------------------------------------------- nav */

const NAV_ITEMS = [
	{ name: 'Platform', href: '#features' },
	{ name: 'How it works', href: '#flight' },
	{ name: 'Metrics', href: '#stats' },
];

function HeroHeader() {
	const [menuOpen, setMenuOpen] = useState(false);
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 40);
		window.addEventListener('scroll', onScroll);
		return () => window.removeEventListener('scroll', onScroll);
	}, []);

	return (
		<header className="fixed inset-x-0 top-0 z-50 w-full px-2">
			<div
				className={cn(
					'mx-auto mt-2 max-w-6xl px-4 transition-all duration-300 sm:px-6',
					scrolled && 'mt-2 max-w-4xl rounded-2xl border border-mc-border bg-mc-card/70 shadow-e2 backdrop-blur-xl'
				)}
			>
				<div className="flex flex-wrap items-center justify-between gap-4 py-3 lg:gap-0">
					<div className="flex w-full items-center justify-between lg:w-auto">
						<a href="#top" className="flex items-center gap-2.5" aria-label="Meshify home">
							<MeshLogo size={28} />
							<span className="text-base font-semibold tracking-[-.01em]">Meshify</span>
							<span className="ml-1 hidden rounded-md border border-mc-border px-1.5 py-0.5 font-mono text-[9px] tracking-[.06em] text-mc-muted sm:inline">
								BY ROCKETRIDE
							</span>
						</a>
						<button
							onClick={() => setMenuOpen((v) => !v)}
							aria-label={menuOpen ? 'Close menu' : 'Open menu'}
							className="relative z-20 -m-2.5 block cursor-pointer p-2.5 text-mc-text-2 lg:hidden"
						>
							{menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
						</button>
					</div>

					<div className="absolute inset-0 m-auto hidden size-fit lg:block">
						<ul className="flex gap-8 text-sm2">
							{NAV_ITEMS.map((item) => (
								<li key={item.name}>
									<a href={item.href} className="block text-mc-text-3 transition-colors duration-150 hover:text-mc-text">
										{item.name}
									</a>
								</li>
							))}
						</ul>
					</div>

					<div
						className={cn(
							'mb-6 hidden w-full flex-col items-center gap-4 rounded-3xl border border-mc-border bg-mc-card p-6 shadow-e4 md:flex-row lg:m-0 lg:flex lg:w-fit lg:gap-4 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none',
							menuOpen && 'flex'
						)}
					>
						<div className="w-full lg:hidden">
							<ul className="space-y-4 text-base">
								{NAV_ITEMS.map((item) => (
									<li key={item.name}>
										<a href={item.href} onClick={() => setMenuOpen(false)} className="block text-mc-text-3 hover:text-mc-text">
											{item.name}
										</a>
									</li>
								))}
							</ul>
						</div>
						<div className="flex w-full flex-col gap-3 sm:flex-row sm:gap-3 md:w-fit">
							<SignInButton mode="modal">
								<button className="rounded-full px-4 py-2 text-sm2 font-medium text-mc-text-3 transition-colors hover:text-mc-text">Sign in</button>
							</SignInButton>
							<SignUpButton mode="modal">
								<button className="rounded-full bg-mc-accent px-4 py-2.5 text-sm2 font-semibold text-white shadow-glow-accent transition-colors hover:bg-mc-accent-hi">
									Launch Mission Control
								</button>
							</SignUpButton>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}

/* -------------------------------------------------------------------- hero */

function Hero() {
	return (
		<section id="top" className="relative overflow-hidden">
			{/* Ambient background */}
			<Atmosphere stars />
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10"
				style={{ background: 'radial-gradient(125% 125% at 50% 100%, transparent 0%, hsl(var(--mc-bg)) 78%)' }}
			/>
			{/* Decorative rotated light streaks (dark-tuned) */}
			<div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden opacity-60 lg:block">
				<div className="absolute left-0 top-0 h-[80rem] w-[35rem] -translate-y-[350px] -rotate-45 rounded-full" style={{ background: 'radial-gradient(68% 68% at 55% 31%, hsl(var(--mc-accent)/.1) 0, transparent 72%)' }} />
				<div className="absolute left-0 top-0 h-[80rem] w-56 -translate-y-[350px] -rotate-45 rounded-full" style={{ background: 'radial-gradient(50% 50% at 50% 50%, hsl(var(--mc-purple)/.08) 0, transparent 80%)' }} />
			</div>

			<div className="relative mx-auto max-w-7xl px-6 pt-36 md:pt-44">
				<div className="mx-auto max-w-4xl text-center">
					<AnimatedGroup>
						{/* Announcement pill */}
						<a
							href="#features"
							className="group mx-auto flex w-fit items-center gap-3 rounded-full border border-mc-border bg-mc-card/70 p-1 pl-4 text-sm2 shadow-e1 backdrop-blur transition-colors hover:border-mc-accent/30"
						>
							<span className="flex items-center gap-2 text-mc-text-2">
								<Sparkles className="size-3.5 text-mc-purple" />
								Introducing Mesh AI — grounded, cited answers
							</span>
							<span className="block h-4 w-px bg-mc-border" />
							<span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-mc-surface duration-500">
								<div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
									<span className="flex size-6 items-center justify-center">
										<ArrowRight className="size-3" />
									</span>
									<span className="flex size-6 items-center justify-center">
										<ArrowRight className="size-3" />
									</span>
								</div>
							</span>
						</a>

						{/* Heading */}
						<h1 className="mx-auto mt-8 max-w-4xl text-balance text-5xl font-semibold leading-[1.03] tracking-[-.035em] md:text-7xl lg:mt-12">
							Engineering knowledge,{' '}
							<span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(100deg, hsl(var(--mc-accent-hi)), hsl(var(--mc-purple)))' }}>
								instantly answerable
							</span>
						</h1>

						<p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-mc-text-3">
							Meshify centralizes your repositories, documents and engineering discussions into one AI workspace — every answer
							grounded, cited, and scoped to your org.
						</p>
					</AnimatedGroup>

					<AnimatedGroup
						variants={{
							container: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.5 } } },
							item: { hidden: { opacity: 0, y: 12, filter: 'blur(6px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } } },
						}}
						className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
					>
						<div className="rounded-[16px] border border-mc-border bg-mc-text/[.04] p-0.5">
							<SignUpButton mode="modal">
								<button className="rounded-[13px] bg-mc-accent px-6 py-3 text-base font-semibold text-white shadow-glow-accent transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-mc-accent-hi hover:shadow-glow-accent-lg active:translate-y-px">
									Launch Mission Control
								</button>
							</SignUpButton>
						</div>
						<SignInButton mode="modal">
							<button className="rounded-[15px] border border-mc-border bg-mc-card px-6 py-3 text-base font-semibold text-mc-text-2 shadow-e1 transition-colors hover:bg-mc-surface hover:text-mc-text">
								Explore Demo
							</button>
						</SignInButton>
					</AnimatedGroup>

					<p className="mt-6 font-mono text-caption tracking-[.04em] text-mc-muted-2">SOC 2 Type II · self-host ready · no credit card required</p>
				</div>

				{/* Framed product still */}
				<AnimatedGroup
					variants={{
						container: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { delayChildren: 0.7 } } },
						item: { hidden: { opacity: 0, y: 30, filter: 'blur(10px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 1, ease: EASE } } },
					}}
					className="relative mt-16 md:mt-20"
				>
					<div className="relative mx-auto max-w-5xl">
						<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40" style={{ background: 'linear-gradient(to top, hsl(var(--mc-bg)), transparent)' }} />
						<ProductStill />
					</div>
				</AnimatedGroup>
			</div>
		</section>
	);
}

/** A dark product still — clearly a marketing mock, not live data. */
function ProductStill() {
	return (
		<div className="overflow-hidden rounded-2xl border border-mc-border bg-mc-card shadow-e4 ring-1 ring-mc-hairline">
			{/* window chrome */}
			<div className="flex items-center gap-2 border-b border-mc-hairline bg-mc-surface/60 px-4 py-3">
				<span className="h-2.5 w-2.5 rounded-full bg-mc-raised" />
				<span className="h-2.5 w-2.5 rounded-full bg-mc-raised" />
				<span className="h-2.5 w-2.5 rounded-full bg-mc-raised" />
				<span className="ml-3 truncate font-mono text-[11px] text-mc-muted-2">meshify.rocketride.ai / payments-core</span>
				<span className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] text-mc-success-lo sm:flex">
					<span className="h-[5px] w-[5px] rounded-full bg-mc-success" />
					ALL SYSTEMS NOMINAL
				</span>
			</div>
			<div className="grid h-[300px] grid-cols-1 sm:h-[360px] sm:grid-cols-[210px_1fr]">
				{/* sidebar */}
				<div className="hidden flex-col gap-2 border-r border-mc-hairline bg-mc-card/40 p-4 sm:flex">
					<div className="rounded-full bg-mc-accent px-3 py-2 text-center text-sm2 font-semibold text-white shadow-glow-accent">+ New Conversation</div>
					<div className="mt-2 font-mono text-[9px] tracking-[.1em] text-mc-muted-2">PINNED</div>
					<div className="rounded-lg bg-mc-accent/[.12] px-2.5 py-1.5 text-xs font-medium text-mc-accent-lo">Refund retry logic</div>
					<div className="px-2.5 py-1.5 text-xs text-mc-text-3">Webhook idempotency</div>
					<div className="px-2.5 py-1.5 text-xs text-mc-text-3">ADR-027 rollout</div>
				</div>
				{/* thread */}
				<div className="flex flex-col gap-3.5 p-6">
					<div className="flex justify-end">
						<div className="rounded-[14px] rounded-br-md bg-mc-accent/[.12] px-3.5 py-2.5 text-sm2 text-mc-text-2">Who gets paged on a MANUAL_REVIEW refund?</div>
					</div>
					<div className="flex gap-2.5">
						<div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg shadow-glow-accent" style={{ background: 'linear-gradient(135deg, hsl(var(--mc-accent)), hsl(var(--mc-purple)))' }}>
							<MeshMark size={17} />
						</div>
						<div className="flex-1">
							<div className="rounded-[14px] rounded-tl-md bg-mc-surface px-3.5 py-3 text-sm2 leading-relaxed text-mc-text-2">
								The <strong className="font-semibold text-mc-text">on-call payments engineer</strong>, via the escalation policy in{' '}
								<span className="font-mono text-[11.5px] text-mc-accent-lo">retry_policy.rs</span>.
							</div>
							<div className="mt-2 flex flex-wrap gap-1.5">
								<MockChip variant="accent">state_machine.rs</MockChip>
								<MockChip variant="purple">refund-runbook.md</MockChip>
								<MockChip variant="success">88% confident</MockChip>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function MockChip({ children, variant }: { children: string; variant: 'accent' | 'purple' | 'success' }) {
	const tint = {
		accent: 'bg-mc-accent/[.12] text-mc-accent-lo',
		purple: 'bg-mc-purple/[.12] text-mc-purple-lo',
		success: 'bg-mc-success/[.12] text-mc-success-lo',
	}[variant];
	return <span className={cn('rounded-md px-2 py-1 font-mono text-[10px] font-medium', tint)}>{children}</span>;
}

/* ------------------------------------------------------------------ logos */

function Logos() {
	return (
		<section className="border-y border-mc-hairline bg-mc-card/30 px-6 py-10">
			<div className="mx-auto flex max-w-5xl flex-col items-center gap-6">
				<span className="font-mono text-[11px] tracking-[.14em] text-mc-muted-2">TRUSTED BY ENGINEERING TEAMS AT</span>
				<div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-lg font-semibold tracking-[-.01em] text-mc-muted">
					{['Northwind', 'Halcyon', 'Vector Labs', 'Fathom', 'Aperture'].map((n) => (
						<span key={n} className="transition-colors hover:text-mc-text-3">
							{n}
						</span>
					))}
				</div>
			</div>
		</section>
	);
}

/* --------------------------------------------------------------- features */

const FEATURES = [
	{ icon: GitBranch, title: 'Index repositories', body: 'Point Mesh at a repo. It maps files and embeds symbols as coverage rises visibly.' },
	{ icon: FileText, title: 'Generate documentation', body: 'Turn indexed knowledge into runbooks and ADRs, grounded in real source.' },
];

function Features() {
	return (
		<section id="features" className="relative flex flex-col gap-12 px-6 py-24 sm:px-10">
			<Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-3.5 text-center">
				<Kicker className="text-mc-accent-lo">THE WORKSPACE</Kicker>
				<h2 className="text-balance text-3xl font-semibold leading-[1.08] tracking-[-.03em] sm:text-[44px]">One calm surface for your entire engineering org</h2>
				<p className="max-w-[56ch] text-lg leading-relaxed text-mc-text-3">
					Mesh indexes every repo and document, then answers with citations and confidence — so nobody re-learns the codebase from scratch.
				</p>
			</Reveal>

			<div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2">
				{/* Featured — chat */}
				<Reveal className="md:row-span-2">
					<div className="flex h-full flex-col gap-4 rounded-3xl border border-mc-accent/25 bg-mc-card p-8 shadow-e2" style={{ backgroundImage: 'linear-gradient(180deg, hsl(var(--mc-accent)/.06), transparent 60%)' }}>
						<FeatureIcon gradient>
							<Sparkles className="size-5 text-white" />
						</FeatureIcon>
						<div className="text-h2 font-semibold tracking-[-.02em]">Chat grounded in your knowledge</div>
						<p className="text-body leading-relaxed text-mc-text-3">
							Ask anything across code and docs. Every answer streams with citations, confidence, and jump-to-source — a calm reading experience, tuned for engineering.
						</p>
						<div className="mt-auto rounded-2xl border border-mc-border bg-mc-card/70 p-3.5 shadow-e1">
							<div className="text-sm2 leading-relaxed text-mc-text-2">
								Refunds route to <span className="font-mono text-[11.5px] text-mc-accent-lo">MANUAL_REVIEW</span> when{' '}
								<span className="font-mono text-[11.5px]">attempts&nbsp;&gt;&nbsp;3</span>
							</div>
							<div className="mt-2.5 flex gap-1.5">
								<MockChip variant="accent">state_machine.rs</MockChip>
								<MockChip variant="success">88%</MockChip>
							</div>
						</div>
					</div>
				</Reveal>

				{FEATURES.map((f, i) => (
					<Reveal key={f.title} delay={0.05 * (i + 1)}>
						<div className="flex h-full flex-col gap-3 rounded-3xl border border-mc-border bg-mc-card p-7 shadow-e1">
							<FeatureIcon variant={i === 0 ? 'accent' : 'purple'}>
								<f.icon className="size-5" />
							</FeatureIcon>
							<div className="text-h3 font-semibold tracking-[-.01em]">{f.title}</div>
							<p className="text-sm2 leading-relaxed text-mc-text-3">{f.body}</p>
						</div>
					</Reveal>
				))}

				{/* Semantic search — wide */}
				<Reveal className="md:col-span-2">
					<div className="flex h-full items-center gap-5 rounded-3xl border border-mc-purple/25 bg-mc-card p-7 shadow-e1" style={{ backgroundImage: 'linear-gradient(90deg, hsl(var(--mc-purple)/.07), transparent 60%)' }}>
						<div className="flex-1">
							<div className="mb-2 flex items-center gap-2 text-h3 font-semibold tracking-[-.01em]">
								<Search className="size-4 text-mc-purple" /> Semantic search across everything
							</div>
							<p className="text-sm2 leading-relaxed text-mc-text-3">Meaning, not keywords — spanning code, docs, and past conversations in one query.</p>
						</div>
						<div className="hidden max-w-[220px] flex-wrap gap-2 sm:flex">
							{['code', 'docs', 'conversations'].map((t) => (
								<span key={t} className="rounded-full border border-mc-border bg-mc-surface px-2.5 py-1.5 text-[11px] font-medium text-mc-text-3">
									{t}
								</span>
							))}
						</div>
					</div>
				</Reveal>
			</div>
		</section>
	);
}

function FeatureIcon({ children, gradient, variant }: { children: React.ReactNode; gradient?: boolean; variant?: 'accent' | 'purple' }) {
	if (gradient) {
		return (
			<div className="flex h-11 w-11 items-center justify-center rounded-xl shadow-glow-accent" style={{ background: 'linear-gradient(135deg, hsl(var(--mc-accent)), hsl(var(--mc-purple)))' }}>
				{children}
			</div>
		);
	}
	return (
		<div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', variant === 'purple' ? 'bg-mc-purple/[.12] text-mc-purple-lo' : 'bg-mc-accent/[.12] text-mc-accent-lo')}>
			{children}
		</div>
	);
}

/* ------------------------------------------------------------------ stats */

const STATS = [
	{ v: '2.4B', label: 'lines of code indexed', accent: true },
	{ v: '120ms', label: 'median cited answer' },
	{ v: '94%', label: 'knowledge coverage', success: true },
	{ v: '40k+', label: 'engineers onboarded', accent: true },
];

function Stats() {
	return (
		<section id="stats" className="border-y border-mc-hairline bg-mc-card/30 px-6 py-16 sm:px-10">
			<div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 text-center lg:grid-cols-4">
				{STATS.map((s) => (
					<Reveal key={s.label}>
						<div
							className={cn('text-4xl font-semibold tracking-[-.03em] sm:text-5xl', s.success ? 'text-mc-success-lo' : s.accent ? 'text-transparent' : 'text-mc-text')}
							style={s.accent ? { backgroundImage: 'linear-gradient(100deg, hsl(var(--mc-accent-hi)), hsl(var(--mc-purple)))', WebkitBackgroundClip: 'text', backgroundClip: 'text' } : undefined}
						>
							{s.v}
						</div>
						<div className="mt-1.5 text-sm2 text-mc-text-3">{s.label}</div>
					</Reveal>
				))}
			</div>
		</section>
	);
}

/* ------------------------------------------------------------- flight plan */

const STEPS = [
	{ n: '01', title: 'Connect', body: 'Link repositories and drop in docs. Mesh begins indexing immediately.', icon: GitBranch },
	{ n: '02', title: 'Understand', body: 'Coverage rises as symbols, structure, and history are embedded.', icon: FileText },
	{ n: '03', title: 'Ask Mesh', body: 'Get cited, confidence-scored answers and auto-drafted documentation.', icon: MessageSquare },
];

function FlightPlan() {
	return (
		<section id="flight" className="flex flex-col gap-12 px-6 py-24 sm:px-10">
			<Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
				<Kicker className="text-mc-accent-lo">FLIGHT PLAN</Kicker>
				<h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-[-.03em] sm:text-[40px]">From repo to answer in three moves</h2>
			</Reveal>
			<div className="relative mx-auto grid w-full max-w-4xl grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6">
				<div className="pointer-events-none absolute left-[16%] right-[16%] top-7 hidden h-px sm:block" style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--mc-accent)/.4), hsl(var(--mc-purple)/.4), transparent)' }} />
				{STEPS.map((s, i) => (
					<Reveal key={s.n} delay={0.08 * i} className="relative flex flex-col items-center gap-3 px-4 text-center">
						<div className="flex h-14 w-14 items-center justify-center rounded-full border border-mc-accent/30 bg-mc-card font-mono text-base font-semibold text-mc-accent-lo shadow-e2">
							{s.n}
						</div>
						<div className="flex items-center gap-2 text-h3 font-semibold">
							<s.icon className="size-4 text-mc-purple" /> {s.title}
						</div>
						<p className="text-sm2 leading-relaxed text-mc-text-3">{s.body}</p>
					</Reveal>
				))}
			</div>
		</section>
	);
}

/* ----------------------------------------------------------------- footer */

const FOOTER_COLS = [
	['PRODUCT', ['Mission Control', 'Mesh Chat', 'Repositories', 'Documents']],
	['PLATFORM', ['Indexing', 'Citations', 'Self-host', 'Security']],
	['COMPANY', ['About', 'Careers', 'Blog', 'Contact']],
	['RESOURCES', ['Docs', 'Changelog', 'Status', 'API']],
] as const;

function Footer() {
	return (
		<>
			<footer className="flex flex-col gap-10 border-t border-mc-hairline bg-mc-card/30 px-6 py-12 sm:flex-row sm:px-10">
				<div className="flex max-w-[260px] flex-col gap-2.5">
					<div className="flex items-center gap-2.5">
						<MeshLogo size={24} />
						<span className="text-sm font-semibold">Meshify</span>
					</div>
					<p className="text-caption leading-relaxed text-mc-muted">The intelligent engineering workspace, built on RocketRide AI infrastructure.</p>
				</div>
				<div className="grid flex-1 grid-cols-2 gap-6 sm:grid-cols-4">
					{FOOTER_COLS.map(([head, items]) => (
						<div key={head}>
							<div className="mb-2 font-mono text-[11px] tracking-[.06em] text-mc-muted-2">{head}</div>
							<div className="flex flex-col gap-1.5 text-caption text-mc-text-3">
								{items.map((i) => (
									<span key={i} className="cursor-pointer transition-colors hover:text-mc-text">
										{i}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			</footer>
			<div className="flex flex-col gap-2 border-t border-mc-hairline px-6 py-5 text-center font-mono text-[11.5px] text-mc-muted-2 sm:flex-row sm:justify-between sm:px-10 sm:text-left">
				<span>© 2026 Rocketride, Inc.</span>
				<span>SOC 2 Type II · ISO 27001</span>
			</div>
		</>
	);
}
