import type pg from 'pg';
import type { WebhookEvent, WebhookEventStatus } from './webhook-event.entity.js';
import type { RecordWebhookEventInput, WebhookEventRepository } from './webhook-event.repository.js';

interface WebhookEventRow {
	id: string;
	provider: string;
	delivery_id: string;
	event_type: string;
	integration_id: string | null;
	payload: Record<string, unknown>;
	status: WebhookEventStatus;
	error: string | null;
	received_at: Date;
	processed_at: Date | null;
}

function toDomain(row: WebhookEventRow): WebhookEvent {
	return {
		id: row.id,
		provider: row.provider,
		deliveryId: row.delivery_id,
		eventType: row.event_type,
		integrationId: row.integration_id,
		payload: row.payload,
		status: row.status,
		error: row.error,
		receivedAt: row.received_at,
		processedAt: row.processed_at,
	};
}

export class PostgresWebhookEventRepository implements WebhookEventRepository {
	constructor(private readonly pool: pg.Pool) {}

	async recordIfNew(input: RecordWebhookEventInput): Promise<WebhookEvent | undefined> {
		const { rows } = await this.pool.query<WebhookEventRow>(
			`insert into webhook_events (provider, delivery_id, event_type, integration_id, payload)
			 values ($1, $2, $3, $4, $5)
			 on conflict (provider, delivery_id) do nothing
			 returning *`,
			[input.provider, input.deliveryId, input.eventType, input.integrationId ?? null, JSON.stringify(input.payload)]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findById(id: string): Promise<WebhookEvent | undefined> {
		const { rows } = await this.pool.query<WebhookEventRow>('select * from webhook_events where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async markStatus(id: string, status: WebhookEventStatus, error?: string | null): Promise<void> {
		await this.pool.query(
			`update webhook_events
			 set status = $2,
			     error = $3,
			     processed_at = case when $2 in ('processed', 'skipped', 'failed') then now() else processed_at end
			 where id = $1`,
			[id, status, error ?? null]
		);
	}

	async listReprocessable(before: Date): Promise<WebhookEvent[]> {
		const { rows } = await this.pool.query<WebhookEventRow>("select * from webhook_events where status in ('received','queued') and received_at < $1 order by received_at limit 500", [before]);
		return rows.map(toDomain);
	}

	async listRecentByIntegration(integrationId: string, limit: number): Promise<WebhookEvent[]> {
		const { rows } = await this.pool.query<WebhookEventRow>(
			'select * from webhook_events where integration_id = $1 order by received_at desc limit $2',
			[integrationId, limit]
		);
		return rows.map(toDomain);
	}

	async deleteTerminalBefore(before: Date): Promise<number> {
		const result = await this.pool.query(
			`delete from webhook_events where received_at < $1 and status in ('processed', 'skipped', 'failed')`,
			[before]
		);
		return result.rowCount ?? 0;
	}
}
