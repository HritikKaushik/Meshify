import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NotFoundPage } from './pages/NotFoundPage';

// Route-level code splitting: every screen, the public landing included, loads
// in its own chunk on demand, so the entry bundle carries only the router, the
// Clerk provider and the shells' glue. (The landing page used to be imported
// statically, which put its hero and animations in front of every signed-in
// visit that never renders it.)
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const OrgShell = lazy(() => import('@/components/layout/OrgShell').then((m) => ({ default: m.OrgShell })));
const WorkspaceShell = lazy(() => import('@/components/layout/WorkspaceShell').then((m) => ({ default: m.WorkspaceShell })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DocumentsPage = lazy(() => import('./pages/projects/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const ChatPage = lazy(() => import('./pages/projects/ChatPage').then((m) => ({ default: m.ChatPage })));
const RepositoriesPage = lazy(() => import('./pages/projects/RepositoriesPage').then((m) => ({ default: m.RepositoriesPage })));
const SlackPage = lazy(() => import('./pages/projects/SlackPage').then((m) => ({ default: m.SlackPage })));
const SlackCallbackPage = lazy(() => import('./pages/oauth/SlackCallbackPage').then((m) => ({ default: m.SlackCallbackPage })));
const ProviderCallbackPage = lazy(() => import('./pages/oauth/ProviderCallbackPage').then((m) => ({ default: m.ProviderCallbackPage })));
const IntegrationsPage = lazy(() => import('./pages/projects/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));
const SettingsPage = lazy(() => import('./pages/projects/SettingsPage').then((m) => ({ default: m.SettingsPage })));

/** Gates its children behind a Clerk session; sends anonymous visitors to sign-in. */
function Protected({ children }: { children: ReactNode }) {
	return (
		<>
			<SignedIn>{children}</SignedIn>
			<SignedOut>
				<RedirectToSignIn />
			</SignedOut>
		</>
	);
}

/** Calm full-screen fallback shown briefly while a route chunk loads. */
function RouteFallback() {
	return <div className="flex min-h-screen items-center justify-center bg-mc-bg text-sm text-mc-text-3">Loading…</div>;
}

export function App() {
	// A crash inside one screen is contained here and cleared by navigating to
	// another route (the boundary resets on path change) rather than blanking the app.
	const location = useLocation();
	return (
		<ErrorBoundary resetKey={location.pathname}>
			<Suspense fallback={<RouteFallback />}>
				<Routes>
				<Route path="/" element={<LandingPage />} />

				{/* Project Home (3b) — org-level chrome, no project-list sidebar. */}
					<Route
						element={
							<Protected>
								<OrgShell />
							</Protected>
						}
					>
						<Route path="/home" element={<DashboardPage />} />
						{/* Legacy path — Project Home now lives at /home (post-login default). */}
						<Route path="/dashboard" element={<Navigate to="/home" replace />} />
					</Route>

					{/* Project Workspace (3c) — conversation-centric chrome, no project list. */}
					<Route
						path="/projects/:projectId"
						element={
							<Protected>
								<WorkspaceShell />
							</Protected>
						}
					>
						<Route index element={<Navigate to="chat" replace />} />
						<Route path="chat" element={<ChatPage />} />
						<Route path="repository" element={<RepositoriesPage />} />
						<Route path="documents" element={<DocumentsPage />} />
						<Route path="slack" element={<SlackPage />} />
						<Route path="integrations" element={<IntegrationsPage />} />
						<Route path="settings" element={<SettingsPage />} />
					</Route>

				{/* Slack OAuth redirect target — static, same-origin, Clerk-gated (projectId travels in the signed state). */}
					<Route
						path="/oauth/slack/callback"
						element={
							<Protected>
								<SlackCallbackPage />
							</Protected>
						}
					/>

					{/* Generic provider redirect target — static route above wins for Slack's legacy flow. */}
					<Route
						path="/oauth/:provider/callback"
						element={
							<Protected>
								<ProviderCallbackPage />
							</Protected>
						}
					/>

					<Route path="*" element={<NotFoundPage />} />
				</Routes>
			</Suspense>
		</ErrorBoundary>
	);
}
