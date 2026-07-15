import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Route-level code splitting: the public landing (above) paints immediately,
// while the authenticated shells + pages — and the heavier deps they pull in
// (framer-motion for the chat reveal, the evaluation/search tables) — load on
// demand in their own chunks. Behavior is unchanged; only load timing differs.
const OrgShell = lazy(() => import('@/components/layout/OrgShell').then((m) => ({ default: m.OrgShell })));
const WorkspaceShell = lazy(() => import('@/components/layout/WorkspaceShell').then((m) => ({ default: m.WorkspaceShell })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ProjectHomePage = lazy(() => import('./pages/projects/ProjectHomePage').then((m) => ({ default: m.ProjectHomePage })));
const DocumentsPage = lazy(() => import('./pages/projects/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const SearchPage = lazy(() => import('./pages/projects/SearchPage').then((m) => ({ default: m.SearchPage })));
const ChatPage = lazy(() => import('./pages/projects/ChatPage').then((m) => ({ default: m.ChatPage })));
const EvaluationPage = lazy(() => import('./pages/projects/EvaluationPage').then((m) => ({ default: m.EvaluationPage })));
const RepositoriesPage = lazy(() => import('./pages/projects/RepositoriesPage').then((m) => ({ default: m.RepositoriesPage })));
const SlackPage = lazy(() => import('./pages/projects/SlackPage').then((m) => ({ default: m.SlackPage })));
const SlackCallbackPage = lazy(() => import('./pages/oauth/SlackCallbackPage').then((m) => ({ default: m.SlackCallbackPage })));
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
	return (
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
						<Route path="overview" element={<ProjectHomePage />} />
						<Route path="repository" element={<RepositoriesPage />} />
						<Route path="documents" element={<DocumentsPage />} />
						<Route path="slack" element={<SlackPage />} />
						<Route path="search" element={<SearchPage />} />
						<Route path="evaluation" element={<EvaluationPage />} />
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

					<Route path="*" element={<NotFoundPage />} />
			</Routes>
		</Suspense>
	);
}
