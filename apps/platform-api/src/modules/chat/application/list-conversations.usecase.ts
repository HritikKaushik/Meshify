import type { ChatRepository, ChatSummary } from '@meshify/data-access';

/** Lists a project's conversations (pinned first, then newest) for the workspace sidebar. */
export class ListConversationsUseCase {
	constructor(private readonly chats: ChatRepository) {}

	execute(projectId: string): Promise<ChatSummary[]> {
		return this.chats.findByProjectId(projectId);
	}
}
