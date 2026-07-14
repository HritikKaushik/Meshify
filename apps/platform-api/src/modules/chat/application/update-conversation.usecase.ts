import type { Chat, ChatRepository, UpdateChatInput } from '@meshify/data-access';
import { ChatNotFoundError } from './ask-question.usecase.js';
import { loadConversationInProject } from './load-conversation-in-project.js';

export interface UpdateConversationCommand {
	projectId: string;
	chatId: string;
	patch: UpdateChatInput;
}

/** Pins/unpins or renames a conversation, scoped to its project. */
export class UpdateConversationUseCase {
	constructor(private readonly chats: ChatRepository) {}

	async execute(command: UpdateConversationCommand): Promise<Chat> {
		await loadConversationInProject(this.chats, command.projectId, command.chatId);
		const updated = await this.chats.updateChat(command.chatId, command.patch);
		if (!updated) throw new ChatNotFoundError(command.chatId);
		return updated;
	}
}
