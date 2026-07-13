export interface Chat {
	id: string;
	projectId: string;
	userId: string | null;
	title: string | null;
	pinned: boolean;
	createdAt: Date;
}

/** A conversation plus its message count, for the workspace conversation list. */
export interface ChatSummary extends Chat {
	messageCount: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageCitation {
	sourcePath: string;
	chunkId?: string;
	score: number;
}

export interface Message {
	id: string;
	chatId: string;
	role: MessageRole;
	content: string;
	citations: MessageCitation[];
	latencyMs: number | null;
	modelUsed: string | null;
	tokensUsed: number | null;
	createdAt: Date;
}
