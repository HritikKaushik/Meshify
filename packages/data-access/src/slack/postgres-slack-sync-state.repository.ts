import type pg from 'pg';
import type { SlackSyncState } from './slack-sync-state.entity.js';
import type { SlackSyncStateRepository } from './slack-sync-state.repository.js';

interface SlackSyncStateRow {
	id: string;
	slack_channel_id: string;
	project_id: string;
	last_synced_ts: string | null;
	last_synced_at: Date | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: SlackSyncStateRow): SlackSyncState {
	return {
		id: row.id,
		slackChannelId: row.slack_channel_id,
		projectId: row.project_id,
		lastSyncedTs: row.last_synced_ts,
		lastSyncedAt: row.last_synced_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresSlackSyncStateRepository implements SlackSyncStateRepository {
	constructor(private readonly pool: pg.Pool) {}

	async findByChannel(slackChannelId: string): Promise<SlackSyncState | undefined> {
		const { rows } = await this.pool.query<SlackSyncStateRow>('select * from slack_sync_state where slack_channel_id = $1', [slackChannelId]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async upsertCursor(input: { id: string; slackChannelId: string; projectId: string; lastSyncedTs: string | null }): Promise<SlackSyncState> {
		const { rows } = await this.pool.query<SlackSyncStateRow>(
			`insert into slack_sync_state (id, slack_channel_id, project_id, last_synced_ts, last_synced_at)
			 values ($1, $2, $3, $4, now())
			 on conflict (slack_channel_id) do update set last_synced_ts = excluded.last_synced_ts, last_synced_at = now(), updated_at = now()
			 returning *`,
			[input.id, input.slackChannelId, input.projectId, input.lastSyncedTs]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into slack_sync_state returned no row');
		return toDomain(row);
	}
}
