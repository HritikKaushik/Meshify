import { useOutletContext } from 'react-router-dom';
import type { Conversation, Project } from '@/api';

export interface WorkspaceContext {
	project: Project;
	projectId: string;
	/** Conversations for this project (pinned first, then newest). */
	conversations: Conversation[];
	/** Re-fetch the conversation list (after sending a message, pinning, etc.). */
	refreshConversations: () => Promise<unknown>;
}

/** Access the active project + conversations provided by WorkspaceShell's Outlet. */
export function useWorkspace(): WorkspaceContext {
	return useOutletContext<WorkspaceContext>();
}
