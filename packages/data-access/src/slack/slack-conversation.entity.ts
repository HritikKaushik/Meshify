export type SlackConversationStatus = 'pending' | 'embedded' | 'failed' | 'deleted';
export type SlackVisibility = 'public' | 'private';

export interface SlackParticipant {
	id: string;
	name: string;
}

/**
 * A grouped Slack "conversation document" — the unit of embedding. A whole
 * thread, or a time-windowed run of channel messages, becomes ONE conversation
 * (not one embedding per message). Its rendered text is what RocketRide ingests;
 * everything else here is the metadata that RocketRide cannot carry through
 * ingestion and so is preserved in Postgres, keyed by `sourcePath`, to enrich
 * search results and chat citations at read time.
 */
export interface SlackConversation {
	id: string;
	projectId: string;
	workspaceId: string;
	slackChannelId: string;
	/** Denormalized Slack channel id (string), for citation display without a join. */
	channelId: string;
	/** Denormalized channel name at ingest time, for chat citations. */
	channelName: string | null;
	/** Stable per-project identity of this conversation (see {@link slackConversationKey}). */
	conversationKey: string;
	/** The Qdrant `source_path` this conversation is embedded under (see {@link slackSourcePath}). */
	sourcePath: string;
	threadTs: string | null;
	tsStart: string | null;
	tsEnd: string | null;
	permalink: string | null;
	participants: SlackParticipant[];
	messageCount: number;
	reactionCount: number;
	visibility: SlackVisibility;
	/** sha256 of the rendered text — lets incremental sync skip unchanged conversations. */
	contentHash: string;
	status: SlackConversationStatus;
	createdAt: Date;
	updatedAt: Date;
}

/** The `source_path` prefix that marks a Qdrant chunk as originating from Slack. */
export const SLACK_SOURCE_PREFIX = 'slack/';

/** True when a Qdrant `source_path` (== `payload.meta.parent`) belongs to a Slack conversation. */
export function isSlackSourcePath(sourcePath: string): boolean {
	return sourcePath.startsWith(SLACK_SOURCE_PREFIX);
}

/**
 * Stable per-project key for a conversation. `anchor` is `t<threadTs>` for a
 * thread or `w<windowStartTs>` for a non-threaded time window. Slack channel ids
 * are globally unique within a workspace, so `<channelId>/<anchor>` is unique
 * per project.
 */
export function slackConversationKey(channelId: string, anchor: string): string {
	return `${channelId}/${anchor}`;
}

/**
 * The Qdrant `source_path` for a conversation — the only metadata that survives
 * RocketRide ingestion. Distinctive `slack/` prefix so search can scope to (or
 * exclude) Slack, and a deterministic tail so re-sync can target the exact
 * points to purge before re-ingesting.
 */
export function slackSourcePath(teamId: string, conversationKey: string): string {
	return `${SLACK_SOURCE_PREFIX}${teamId}/${conversationKey}`;
}
