import type { SlackConversation, SlackConversationStatus, SlackParticipant, SlackVisibility } from './slack-conversation.entity.js';

export interface UpsertSlackConversationInput {
	id: string;
	projectId: string;
	workspaceId: string;
	slackChannelId: string;
	channelId: string;
	channelName?: string | null;
	conversationKey: string;
	sourcePath: string;
	threadTs?: string | null;
	tsStart?: string | null;
	tsEnd?: string | null;
	permalink?: string | null;
	participants: SlackParticipant[];
	messageCount: number;
	reactionCount: number;
	visibility: SlackVisibility;
	contentHash: string;
}

export interface SlackConversationRepository {
	/** Insert or update a conversation by (project_id, conversation_key); resets status to 'pending'. */
	upsert(input: UpsertSlackConversationInput): Promise<SlackConversation>;
	findByProjectAndKey(projectId: string, conversationKey: string): Promise<SlackConversation | undefined>;
	/** Citation enrichment: resolve the conversation behind a Qdrant `source_path`. */
	findByProjectAndSourcePath(projectId: string, sourcePath: string): Promise<SlackConversation | undefined>;
	listByWorkspace(workspaceId: string): Promise<SlackConversation[]>;
	/** All stored conversations for one channel — used by incremental sync to re-check threads for new replies. */
	listByChannel(slackChannelId: string): Promise<SlackConversation[]>;
	listSourcePathsByWorkspace(workspaceId: string): Promise<string[]>;
	updateStatus(id: string, status: SlackConversationStatus): Promise<void>;
	/** Batch lookup by source paths — the ConnectorEngine's content-hash ledger read. */
	findBySourcePaths(projectId: string, sourcePaths: string[]): Promise<SlackConversation[]>;
	/** Single-row aggregate for connector stats — counts + latest activity without loading rows. */
	statsByWorkspace(workspaceId: string): Promise<{ total: number; embedded: number; lastUpdatedAt: Date | null }>;
}
