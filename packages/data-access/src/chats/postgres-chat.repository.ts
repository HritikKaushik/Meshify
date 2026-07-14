import type pg from 'pg';
import type { Chat, ChatSummary, Message, MessageCitation, MessageRole } from './chat.entity.js';
import type { ChatRepository, CreateChatInput, CreateMessageInput, UpdateChatInput } from './chat.repository.js';

interface ChatRow {
	id: string;
	project_id: string;
	user_id: string | null;
	title: string | null;
	pinned: boolean;
	created_at: Date;
}

interface MessageRow {
	id: string;
	chat_id: string;
	role: string;
	content: string;
	citations: MessageCitation[];
	latency_ms: number | null;
	model_used: string | null;
	tokens_used: number | null;
	created_at: Date;
}

function chatToDomain(row: ChatRow): Chat {
	return { id: row.id, projectId: row.project_id, userId: row.user_id, title: row.title, pinned: row.pinned, createdAt: row.created_at };
}

function messageToDomain(row: MessageRow): Message {
	return {
		id: row.id,
		chatId: row.chat_id,
		role: row.role as MessageRole,
		content: row.content,
		citations: row.citations,
		latencyMs: row.latency_ms,
		modelUsed: row.model_used,
		tokensUsed: row.tokens_used,
		createdAt: row.created_at,
	};
}

export class PostgresChatRepository implements ChatRepository {
	constructor(private readonly pool: pg.Pool) {}

	async createChat(input: CreateChatInput): Promise<Chat> {
		const { rows } = await this.pool.query<ChatRow>(
			'insert into chats (id, project_id, user_id, title) values ($1, $2, $3, $4) returning *',
			[input.id, input.projectId, input.userId ?? null, input.title ?? null]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into chats returned no row');
		return chatToDomain(row);
	}

	async findChatById(id: string): Promise<Chat | undefined> {
		const { rows } = await this.pool.query<ChatRow>('select * from chats where id = $1', [id]);
		const row = rows[0];
		return row ? chatToDomain(row) : undefined;
	}

	async findByProjectId(projectId: string): Promise<ChatSummary[]> {
		const { rows } = await this.pool.query<ChatRow & { message_count: string }>(
			`select c.*, (select count(*) from messages m where m.chat_id = c.id) as message_count
			 from chats c where c.project_id = $1
			 order by c.pinned desc, c.created_at desc`,
			[projectId]
		);
		return rows.map((row) => ({ ...chatToDomain(row), messageCount: Number(row.message_count) }));
	}

	async countByProject(projectId: string): Promise<number> {
		const { rows } = await this.pool.query<{ count: number }>('select count(*)::int as count from chats where project_id = $1', [projectId]);
		return rows[0]!.count;
	}

	async updateChat(id: string, patch: UpdateChatInput): Promise<Chat | undefined> {
		const sets: string[] = [];
		const values: unknown[] = [];
		if (patch.title !== undefined) {
			values.push(patch.title);
			sets.push(`title = $${values.length}`);
		}
		if (patch.pinned !== undefined) {
			values.push(patch.pinned);
			sets.push(`pinned = $${values.length}`);
		}
		if (sets.length === 0) return this.findChatById(id);
		values.push(id);
		const { rows } = await this.pool.query<ChatRow>(`update chats set ${sets.join(', ')} where id = $${values.length} returning *`, values);
		const row = rows[0];
		return row ? chatToDomain(row) : undefined;
	}

	async deleteChat(id: string): Promise<void> {
		// messages.chat_id has ON DELETE CASCADE, so this also removes the thread's messages.
		await this.pool.query('delete from chats where id = $1', [id]);
	}

	async createMessage(input: CreateMessageInput): Promise<Message> {
		const { rows } = await this.pool.query<MessageRow>(
			`insert into messages (id, chat_id, role, content, citations, latency_ms, model_used, tokens_used)
			 values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
			[
				input.id,
				input.chatId,
				input.role,
				input.content,
				JSON.stringify(input.citations ?? []),
				input.latencyMs ?? null,
				input.modelUsed ?? null,
				input.tokensUsed ?? null,
			]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into messages returned no row');
		return messageToDomain(row);
	}

	async listMessages(chatId: string, limit = 50): Promise<Message[]> {
		// Take the newest N, then flip back to chronological order.
		const { rows } = await this.pool.query<MessageRow>(
			'select * from (select * from messages where chat_id = $1 order by created_at desc limit $2) recent order by created_at asc',
			[chatId, limit]
		);
		return rows.map(messageToDomain);
	}
}
