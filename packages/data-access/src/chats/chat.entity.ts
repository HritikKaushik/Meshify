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

/** Slack-specific citation metadata, attached when a cited chunk came from a Slack conversation. */
export interface SlackCitation {
	channel: string | null;
	channelId: string;
	threadTs: string | null;
	author: string | null;
	participants: string[];
	/** ISO timestamp of the conversation's first message. */
	timestamp: string | null;
	permalink: string | null;
}

export interface MessageCitation {
	sourcePath: string;
	chunkId?: string;
	score: number;
	/** Which knowledge source this citation came from — only reliably set for Slack today. */
	source?: 'github' | 'documents' | 'slack';
	slack?: SlackCitation;
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
