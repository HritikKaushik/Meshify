import type { ChatRepository } from '@meshify/data-access';
import { loadConversationInProject } from './load-conversation-in-project.js';

export interface DeleteConversationCommand {
	projectId: string;
	chatId: string;
}

/** Deletes a conversation (and, via ON DELETE CASCADE, its messages), scoped to its project. */
export class DeleteConversationUseCase {
	constructor(private readonly chats: ChatRepository) {}

	async execute(command: DeleteConversationCommand): Promise<void> {
		await loadConversationInProject(this.chats, command.projectId, command.chatId);
		await this.chats.deleteChat(command.chatId);
	}
}
