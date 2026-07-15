/**
 * A channel discovered in a connected Slack workspace. `selected` marks the
 * channels the project has chosen to ingest; only selected channels are pulled
 * by the ingest/sync workers.
 */
export interface SlackChannel {
	id: string;
	workspaceId: string;
	projectId: string;
	/** Slack's channel id (e.g. "C0123ABC") — a string, not our uuid. */
	channelId: string;
	name: string | null;
	isPrivate: boolean;
	selected: boolean;
	createdAt: Date;
	updatedAt: Date;
}
