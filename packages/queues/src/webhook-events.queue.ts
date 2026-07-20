import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTS } from './job-options.js';

/**
 * Decouples webhook receipt from processing: the HTTP receiver verifies,
 * records the delivery (webhook_events row), enqueues its id here, and ACKs
 * the provider within milliseconds. The worker normalizes the payload into
 * platform events and dispatches syncs/status flips with BullMQ's retries.
 */
export const WEBHOOK_EVENTS_QUEUE = 'webhook-events';

export interface WebhookEventJobPayload {
	webhookEventId: string;
}

export function createWebhookEventsQueue(connection: ConnectionOptions): Queue<WebhookEventJobPayload> {
	return new Queue<WebhookEventJobPayload>(WEBHOOK_EVENTS_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
}
