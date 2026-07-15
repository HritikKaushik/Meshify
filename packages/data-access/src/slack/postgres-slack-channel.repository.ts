import type pg from 'pg';
import type { SlackChannel } from './slack-channel.entity.js';
import type { SlackChannelRepository, UpsertSlackChannelInput } from './slack-channel.repository.js';

interface SlackChannelRow {
	id: string;
	workspace_id: string;
	project_id: string;
	channel_id: string;
	name: string | null;
	is_private: boolean;
	selected: boolean;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: SlackChannelRow): SlackChannel {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		projectId: row.project_id,
		channelId: row.channel_id,
		name: row.name,
		isPrivate: row.is_private,
		selected: row.selected,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresSlackChannelRepository implements SlackChannelRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: UpsertSlackChannelInput): Promise<SlackChannel> {
		// Preserve `selected` across re-discovery: only metadata is refreshed on conflict.
		const { rows } = await this.pool.query<SlackChannelRow>(
			`insert into slack_channels (id, workspace_id, project_id, channel_id, name, is_private)
			 values ($1, $2, $3, $4, $5, coalesce($6, false))
			 on conflict (workspace_id, channel_id)
			 do update set name = excluded.name, is_private = excluded.is_private, updated_at = now()
			 returning *`,
			[input.id, input.workspaceId, input.projectId, input.channelId, input.name ?? null, input.isPrivate ?? null]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into slack_channels returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<SlackChannel | undefined> {
		const { rows } = await this.pool.query<SlackChannelRow>('select * from slack_channels where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByWorkspace(workspaceId: string): Promise<SlackChannel[]> {
		const { rows } = await this.pool.query<SlackChannelRow>('select * from slack_channels where workspace_id = $1 order by name nulls last, channel_id', [workspaceId]);
		return rows.map(toDomain);
	}

	async listSelectedByWorkspace(workspaceId: string): Promise<SlackChannel[]> {
		const { rows } = await this.pool.query<SlackChannelRow>('select * from slack_channels where workspace_id = $1 and selected = true order by channel_id', [workspaceId]);
		return rows.map(toDomain);
	}

	async setSelected(workspaceId: string, selectedChannelIds: string[]): Promise<void> {
		// Single statement: rows whose channel_id is in the set become selected, the rest deselected.
		await this.pool.query('update slack_channels set selected = (channel_id = any($2)), updated_at = now() where workspace_id = $1', [workspaceId, selectedChannelIds]);
	}
}
