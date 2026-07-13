import { Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { Sparkles } from 'lucide-react';
import { Atmosphere } from '@/components/mc/Atmosphere';
import { MeshLogo, Kicker } from '@/components/mc/primitives';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';

export function LandingPage() {
	return (
		<>
			<SignedIn>
				<Navigate to="/dashboard" replace />
			</SignedIn>
			<SignedOut>
				<div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-mc-bg text-mc-text">
					<Atmosphere stars />
					<div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
						<div className="mb-8 flex items-center gap-3">
							<MeshLogo size={34} />
							<span className="text-lg font-semibold tracking-tight">Meshify</span>
						</div>
						<Kicker className="mb-4">// AI BACKEND-AS-A-SERVICE</Kicker>
						<h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
							<TextGenerateEffect words="An intelligent workspace for every project's knowledge." duration={0.4} />
						</h1>
						<p className="mt-6 max-w-xl text-lg text-mc-text-2">
							Meshify ingests your documents and source code, then answers questions over them — grounded, cited, and scoped to your organization.
						</p>
						<div className="mt-10 flex items-center justify-center gap-4">
							<SignUpButton mode="modal">
								<button className="flex items-center gap-2 rounded-full bg-mc-accent px-6 py-3 text-sm font-semibold text-mc-bg shadow-[0_0_28px_rgba(227,154,76,.35)] transition-colors hover:bg-mc-accent-hi">
									<Sparkles className="h-4 w-4" /> Get started
								</button>
							</SignUpButton>
							<SignInButton mode="modal">
								<button className="rounded-full border border-white/[.12] px-6 py-3 text-sm font-medium text-mc-text-2 transition-colors hover:border-white/25 hover:text-mc-text">
									Sign in
								</button>
							</SignInButton>
						</div>
					</div>
				</div>
			</SignedOut>
		</>
	);
}
