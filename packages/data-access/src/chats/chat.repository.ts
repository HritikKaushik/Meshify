import type { Chat, Message, MessageCitation, MessageRole } from './chat.entity.js';

export interface CreateChatInput {
	id: string;
	projectId: string;
	userId?: string;
	title?: string;
}

export interface CreateMessageInput {
	id: string;
	chatId: string;
	role: MessageRole;
	content: string;
	citations?: MessageCitation[];
	latencyMs?: number;
	modelUsed?: string;
	tokensUsed?: number;
}

export interface ChatRepository {
	createChat(input: CreateChatInput): Promise<Chat>;
	findChatById(id: string): Promise<Chat | undefined>;
	createMessage(input: CreateMessageInput): Promise<Message>;
	/** Most recent messages first-in-time last; `limit` counts from the end of the conversation. */
	listMessages(chatId: string, limit?: number): Promise<Message[]>;
}
