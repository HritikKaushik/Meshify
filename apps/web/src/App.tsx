import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { OrgShell } from '@/components/layout/OrgShell';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectHomePage } from './pages/projects/ProjectHomePage';
import { DocumentsPage } from './pages/projects/DocumentsPage';
import { SearchPage } from './pages/projects/SearchPage';
import { ChatPage } from './pages/projects/ChatPage';
import { EvaluationPage } from './pages/projects/EvaluationPage';
import { RepositoriesPage } from './pages/projects/RepositoriesPage';
import { SettingsPage } from './pages/projects/SettingsPage';

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

export function App() {
	return (
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
					<Route path="search" element={<SearchPage />} />
					<Route path="evaluation" element={<EvaluationPage />} />
					<Route path="settings" element={<SettingsPage />} />
				</Route>

			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}
