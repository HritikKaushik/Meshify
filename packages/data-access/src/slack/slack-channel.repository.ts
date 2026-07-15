import type { SlackChannel } from './slack-channel.entity.js';

export interface UpsertSlackChannelInput {
	id: string;
	workspaceId: string;
	projectId: string;
	channelId: string;
	name?: string | null;
	isPrivate?: boolean;
}

export interface SlackChannelRepository {
	/** Insert or refresh a channel by (workspace_id, channel_id); preserves `selected` on conflict. */
	upsert(input: UpsertSlackChannelInput): Promise<SlackChannel>;
	findById(id: string): Promise<SlackChannel | undefined>;
	listByWorkspace(workspaceId: string): Promise<SlackChannel[]>;
	listSelectedByWorkspace(workspaceId: string): Promise<SlackChannel[]>;
	/** Replace the selected set for a workspace with the given Slack channel ids. */
	setSelected(workspaceId: string, selectedChannelIds: string[]): Promise<void>;
}
