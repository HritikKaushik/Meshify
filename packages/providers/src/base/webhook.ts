import type { IntegrationContext } from './context.js';
import type { PlatformEvent } from '../events/platform-events.js';

/** The raw HTTP delivery as received — body untouched (signatures cover exact bytes). */
export interface RawWebhookRequest {
	headers: Record<string, string | undefined>;
	rawBody: Buffer;
}

export type WebhookDescriptor =
	/** A verified event to record + process. */
	| {
			kind: 'event';
			deliveryId: string;
			eventType: string;
			/** The provider's grant id in the payload (installation id, team id) — resolves the integration. */
			externalAccountId: string | null;
	  }
	/** Provider handshake (Slack url_verification) — respond with `response` body, do not record. */
	| { kind: 'challenge'; response: string }
	/** Verified but irrelevant (unsupported event type, bot echo, …). */
	| { kind: 'ignore'; reason: string };

/**
 * Inbound webhook handling. Receipt is two-phase: the HTTP receiver calls
 * `verifyWebhook` + `describeWebhook` synchronously (no I/O), records the
 * event, and ACKs; the worker later calls `normalizeWebhook` to translate the
 * payload into provider-independent platform events.
 */
export interface WebhookCapable {
	/** Timing-safe signature verification over the exact raw bytes. `now` is injectable for replay-window tests. */
	verifyWebhook(req: RawWebhookRequest, secret: string, now?: Date): boolean;
	describeWebhook(req: RawWebhookRequest): WebhookDescriptor;
	/** Translate a recorded delivery into platform events. Runs in the worker; may do provider I/O via ctx. */
	normalizeWebhook(event: { eventType: string; payload: Record<string, unknown> }, ctx: IntegrationContext): Promise<PlatformEvent[]>;
}
