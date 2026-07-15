import type { SlackSyncState } from './slack-sync-state.entity.js';

export interface SlackSyncStateRepository {
	findByChannel(slackChannelId: string): Promise<SlackSyncState | undefined>;
	/** Advance the cursor for a channel to `lastSyncedTs` (creates the row if absent). */
	upsertCursor(input: { id: string; slackChannelId: string; projectId: string; lastSyncedTs: string | null }): Promise<SlackSyncState>;
}
