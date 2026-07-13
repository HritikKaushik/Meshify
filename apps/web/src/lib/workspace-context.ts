import { useOutletContext } from 'react-router-dom';
import type { Project } from '@/api';

export interface WorkspaceContext {
	project: Project;
	projectId: string;
}

/** Access the active project provided by ProjectWorkspaceShell's Outlet. */
export function useWorkspace(): WorkspaceContext {
	return useOutletContext<WorkspaceContext>();
}
