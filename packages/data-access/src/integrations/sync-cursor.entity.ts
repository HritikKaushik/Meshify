/**
 * Incremental-sync position for one scope of a connector — a channel, a drive,
 * a delta link, a branch. Provider-defined shape inside `cursor` (jsonb).
 * GitHub and Slack still use their legacy stores (`repositories.last_synced_commit`,
 * `slack_sync_state`) behind the CursorStore port; new providers use this table.
 */
export interface SyncCursor {
	id: string;
	connectorId: string;
	scopeKey: string;
	cursor: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}
