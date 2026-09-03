import type { WebhookEvent, WebhookEventStatus } from './webhook-event.entity.js';

export interface RecordWebhookEventInput {
	provider: string;
	deliveryId: string;
	eventType: string;
	integrationId?: string | null;
	payload: Record<string, unknown>;
}

export interface WebhookEventRepository {
	/** Insert unless this delivery was already recorded; undefined = duplicate (redelivery). */
	recordIfNew(input: RecordWebhookEventInput): Promise<WebhookEvent | undefined>;
	findById(id: string): Promise<WebhookEvent | undefined>;
	markStatus(id: string, status: WebhookEventStatus, error?: string | null): Promise<void>;
	/** Deliveries still in 'received'/'queued' older than `before` — the orphan-recovery sweep. */
	listReprocessable(before: Date): Promise<WebhookEvent[]>;
	listRecentByIntegration(integrationId: string, limit: number): Promise<WebhookEvent[]>;
	/**
	 * Retention sweep for terminal events: processed/skipped deliveries older
	 * than `before`, failed ones older than `failedBefore` (default: `before`).
	 * Failed deliveries are the webhook dead-letter record, so callers keep
	 * them around longer for operator review.
	 */
	deleteTerminalBefore(before: Date, failedBefore?: Date): Promise<number>;
}
