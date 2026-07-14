import type { Chat, ChatSummary, Message, MessageCitation, MessageRole } from './chat.entity.js';

export interface UpdateChatInput {
	title?: string;
	pinned?: boolean;
}

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
	/** All conversations for a project, pinned first then newest, each with its message count. */
	findByProjectId(projectId: string): Promise<ChatSummary[]>;
	/** Conversation count for a project — for stats, without loading rows or per-chat message counts. */
	countByProject(projectId: string): Promise<number>;
	/** Patch a conversation's title/pinned flag. Returns the updated chat, or undefined if it doesn't exist. */
	updateChat(id: string, patch: UpdateChatInput): Promise<Chat | undefined>;
	/** Delete a conversation and (via ON DELETE CASCADE) all of its messages. */
	deleteChat(id: string): Promise<void>;
	createMessage(input: CreateMessageInput): Promise<Message>;
	/** Most recent messages first-in-time last; `limit` counts from the end of the conversation. */
	listMessages(chatId: string, limit?: number): Promise<Message[]>;
}
