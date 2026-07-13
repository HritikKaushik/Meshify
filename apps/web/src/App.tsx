import type { ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { AppShell } from '@/components/layout/AppShell';
import { ProjectWorkspaceShell } from '@/components/layout/ProjectWorkspaceShell';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectHomePage } from './pages/projects/ProjectHomePage';
import { DocumentsPage } from './pages/projects/DocumentsPage';
import { SearchPage } from './pages/projects/SearchPage';
import { ChatPage } from './pages/projects/ChatPage';
import { EvaluationPage } from './pages/projects/EvaluationPage';
import { RepositoriesPage } from './pages/projects/RepositoriesPage';

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

			<Route
				element={
					<Protected>
						<AppShell />
					</Protected>
				}
			>
				<Route path="/dashboard" element={<DashboardPage />} />
				<Route path="/projects/:projectId" element={<ProjectWorkspaceShell />}>
					<Route index element={<ProjectHomePage />} />
					<Route path="home" element={<ProjectHomePage />} />
					<Route path="documents" element={<DocumentsPage />} />
					<Route path="search" element={<SearchPage />} />
					<Route path="chat" element={<ChatPage />} />
					<Route path="evaluation" element={<EvaluationPage />} />
					<Route path="repository" element={<RepositoriesPage />} />
				</Route>
			</Route>

			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}
