/**
 * Per-channel incremental-sync cursor. `lastSyncedTs` is the Slack message `ts`
 * of the newest message ingested so far; the sync worker passes it as the
 * `oldest` bound to `conversations.history` so only newer messages are pulled,
 * avoiding a full re-index.
 */
export interface SlackSyncState {
	id: string;
	slackChannelId: string;
	projectId: string;
	lastSyncedTs: string | null;
	lastSyncedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}
