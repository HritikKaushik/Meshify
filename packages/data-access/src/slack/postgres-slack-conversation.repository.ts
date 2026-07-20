import type pg from 'pg';
import type { SlackConversation, SlackConversationStatus, SlackParticipant, SlackVisibility } from './slack-conversation.entity.js';
import type { SlackConversationRepository, UpsertSlackConversationInput } from './slack-conversation.repository.js';

interface SlackConversationRow {
	id: string;
	project_id: string;
	workspace_id: string;
	slack_channel_id: string;
	channel_id: string;
	channel_name: string | null;
	conversation_key: string;
	source_path: string;
	thread_ts: string | null;
	ts_start: string | null;
	ts_end: string | null;
	permalink: string | null;
	participants: SlackParticipant[];
	message_count: number;
	reaction_count: number;
	visibility: string;
	content_hash: string;
	status: string;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: SlackConversationRow): SlackConversation {
	return {
		id: row.id,
		projectId: row.project_id,
		workspaceId: row.workspace_id,
		slackChannelId: row.slack_channel_id,
		channelId: row.channel_id,
		channelName: row.channel_name,
		conversationKey: row.conversation_key,
		sourcePath: row.source_path,
		threadTs: row.thread_ts,
		tsStart: row.ts_start,
		tsEnd: row.ts_end,
		permalink: row.permalink,
		participants: row.participants,
		messageCount: row.message_count,
		reactionCount: row.reaction_count,
		visibility: row.visibility as SlackVisibility,
		contentHash: row.content_hash,
		status: row.status as SlackConversationStatus,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresSlackConversationRepository implements SlackConversationRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsert(input: UpsertSlackConversationInput): Promise<SlackConversation> {
		const { rows } = await this.pool.query<SlackConversationRow>(
			`insert into slack_conversations (
				id, project_id, workspace_id, slack_channel_id, channel_id, channel_name, conversation_key, source_path,
				thread_ts, ts_start, ts_end, permalink, participants, message_count, reaction_count, visibility, content_hash, status
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17, 'pending')
			 on conflict (project_id, conversation_key) do update set
				channel_name = excluded.channel_name,
				source_path = excluded.source_path,
				thread_ts = excluded.thread_ts,
				ts_start = excluded.ts_start,
				ts_end = excluded.ts_end,
				permalink = excluded.permalink,
				participants = excluded.participants,
				message_count = excluded.message_count,
				reaction_count = excluded.reaction_count,
				visibility = excluded.visibility,
				content_hash = excluded.content_hash,
				status = 'pending',
				updated_at = now()
			 returning *`,
			[
				input.id,
				input.projectId,
				input.workspaceId,
				input.slackChannelId,
				input.channelId,
				input.channelName ?? null,
				input.conversationKey,
				input.sourcePath,
				input.threadTs ?? null,
				input.tsStart ?? null,
				input.tsEnd ?? null,
				input.permalink ?? null,
				JSON.stringify(input.participants),
				input.messageCount,
				input.reactionCount,
				input.visibility,
				input.contentHash,
			]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into slack_conversations returned no row');
		return toDomain(row);
	}

	async findByProjectAndKey(projectId: string, conversationKey: string): Promise<SlackConversation | undefined> {
		const { rows } = await this.pool.query<SlackConversationRow>('select * from slack_conversations where project_id = $1 and conversation_key = $2', [projectId, conversationKey]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByProjectAndSourcePath(projectId: string, sourcePath: string): Promise<SlackConversation | undefined> {
		const { rows } = await this.pool.query<SlackConversationRow>('select * from slack_conversations where project_id = $1 and source_path = $2', [projectId, sourcePath]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByWorkspace(workspaceId: string): Promise<SlackConversation[]> {
		const { rows } = await this.pool.query<SlackConversationRow>('select * from slack_conversations where workspace_id = $1 order by ts_end desc nulls last', [workspaceId]);
		return rows.map(toDomain);
	}

	async listByChannel(slackChannelId: string): Promise<SlackConversation[]> {
		const { rows } = await this.pool.query<SlackConversationRow>('select * from slack_conversations where slack_channel_id = $1 order by ts_end desc nulls last', [slackChannelId]);
		return rows.map(toDomain);
	}

	async listSourcePathsByWorkspace(workspaceId: string): Promise<string[]> {
		const { rows } = await this.pool.query<{ source_path: string }>('select source_path from slack_conversations where workspace_id = $1', [workspaceId]);
		return rows.map((r) => r.source_path);
	}

	async findBySourcePaths(projectId: string, sourcePaths: string[]): Promise<SlackConversation[]> {
		if (sourcePaths.length === 0) return [];
		const { rows } = await this.pool.query<SlackConversationRow>('select * from slack_conversations where project_id = $1 and source_path = any($2)', [projectId, sourcePaths]);
		return rows.map(toDomain);
	}

	async updateStatus(id: string, status: SlackConversationStatus): Promise<void> {
		await this.pool.query('update slack_conversations set status = $2, updated_at = now() where id = $1', [id, status]);
	}

	async statsByWorkspace(workspaceId: string): Promise<{ total: number; embedded: number; lastUpdatedAt: Date | null }> {
		const { rows } = await this.pool.query<{ total: number; embedded: number; last_updated_at: Date | null }>(
			`select count(*)::int as total,
			        count(*) filter (where status = 'embedded')::int as embedded,
			        max(updated_at) as last_updated_at
			 from slack_conversations where workspace_id = $1`,
			[workspaceId]
		);
		const row = rows[0]!;
		return { total: row.total, embedded: row.embedded, lastUpdatedAt: row.last_updated_at };
	}
}
