/**
 * One verified inbound webhook delivery. Inserted by the receiver before any
 * processing; the unique (provider, delivery_id) makes provider redeliveries
 * idempotent. Processing happens asynchronously in the worker, which
 * transitions `status` and stamps `processed_at`.
 */
export type WebhookEventStatus = 'received' | 'queued' | 'processed' | 'skipped' | 'failed';

export interface WebhookEvent {
	id: string;
	provider: string;
	/** Provider delivery id (GitHub X-GitHub-Delivery, Slack event_id) or a payload hash fallback. */
	deliveryId: string;
	eventType: string;
	integrationId: string | null;
	payload: Record<string, unknown>;
	status: WebhookEventStatus;
	error: string | null;
	receivedAt: Date;
	processedAt: Date | null;
}
