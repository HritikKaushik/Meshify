import type { Chat, ChatRepository } from '@meshify/data-access';
import { ChatNotFoundError } from './ask-question.usecase.js';

/**
 * Loads a conversation and asserts it belongs to `projectId`, throwing
 * ChatNotFoundError otherwise. The single home for the project-isolation check
 * that the conversation use cases share (previously duplicated per route).
 */
export async function loadConversationInProject(chats: ChatRepository, projectId: string, chatId: string): Promise<Chat> {
	const chat = await chats.findChatById(chatId);
	if (!chat || chat.projectId !== projectId) throw new ChatNotFoundError(chatId);
	return chat;
}
