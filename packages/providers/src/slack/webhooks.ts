import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type { RawWebhookRequest, WebhookDescriptor } from '../base/webhook.js';

/** Slack rejects deliveries whose timestamp strays ±5 min — the replay window. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/** Timing-safe Slack v0 signature verification: v0=HMAC-SHA256(secret, "v0:<ts>:<raw body>"). */
export function verifySlackSignature(req: RawWebhookRequest, secret: string, now: Date = new Date()): boolean {
	const signature = req.headers['x-slack-signature'];
	const timestamp = req.headers['x-slack-request-timestamp'];
	if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
	if (Math.abs(now.getTime() - Number(timestamp) * 1000) > TIMESTAMP_TOLERANCE_MS) return false;

	const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${req.rawBody.toString('utf8')}`).digest('hex')}`;
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Identify a Slack Events API delivery; url_verification handshakes become challenges, not events. */
export function describeSlackWebhook(req: RawWebhookRequest): WebhookDescriptor {
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(req.rawBody.toString('utf8')) as Record<string, unknown>;
	} catch {
		return { kind: 'ignore', reason: 'unparseable payload' };
	}

	if (payload.type === 'url_verification' && typeof payload.challenge === 'string') {
		return { kind: 'challenge', response: JSON.stringify({ challenge: payload.challenge }) };
	}

	if (payload.type !== 'event_callback') {
		return { kind: 'ignore', reason: `unsupported envelope type "${String(payload.type)}"` };
	}

	const event = payload.event as { type?: string } | undefined;
	const teamId = typeof payload.team_id === 'string' ? payload.team_id : null;
	const deliveryId =
		typeof payload.event_id === 'string' ? payload.event_id : createHash('sha256').update(req.rawBody).digest('hex');

	return {
		kind: 'event',
		deliveryId,
		eventType: event?.type ?? 'unknown',
		externalAccountId: teamId,
	};
}
