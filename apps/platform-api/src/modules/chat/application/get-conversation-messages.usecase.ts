import type { Chat, ChatRepository, Message } from '@meshify/data-access';
import { loadConversationInProject } from './load-conversation-in-project.js';

/** How many of a conversation's most recent messages the transcript returns. */
const MESSAGE_LIMIT = 200;

export interface GetConversationMessagesCommand {
	projectId: string;
	chatId: string;
}

/** Loads a conversation's message history (most recent {@link MESSAGE_LIMIT}), scoped to its project. */
export class GetConversationMessagesUseCase {
	constructor(private readonly chats: ChatRepository) {}

	async execute(command: GetConversationMessagesCommand): Promise<{ chat: Chat; messages: Message[] }> {
		const chat = await loadConversationInProject(this.chats, command.projectId, command.chatId);
		const messages = await this.chats.listMessages(command.chatId, MESSAGE_LIMIT);
		return { chat, messages };
	}
}
