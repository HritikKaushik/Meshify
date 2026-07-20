import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type { RawWebhookRequest, WebhookDescriptor } from '../base/webhook.js';

/** Timing-safe X-Hub-Signature-256 verification over the exact raw bytes. */
export function verifyGitHubSignature(req: RawWebhookRequest, secret: string): boolean {
	const provided = req.headers['x-hub-signature-256'];
	if (!provided || !provided.startsWith('sha256=')) return false;
	const expected = `sha256=${createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Identify a GitHub delivery: id from X-GitHub-Delivery, type from X-GitHub-Event (+action), grant from payload.installation.id. */
export function describeGitHubWebhook(req: RawWebhookRequest): WebhookDescriptor {
	const eventName = req.headers['x-github-event'];
	if (!eventName) return { kind: 'ignore', reason: 'missing x-github-event header' };
	if (eventName === 'ping') return { kind: 'ignore', reason: 'ping' };

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(req.rawBody.toString('utf8')) as Record<string, unknown>;
	} catch {
		return { kind: 'ignore', reason: 'unparseable payload' };
	}

	const action = typeof payload.action === 'string' ? payload.action : null;
	const installation = payload.installation as { id?: number } | undefined;
	const deliveryId = req.headers['x-github-delivery'] ?? createHash('sha256').update(req.rawBody).digest('hex');

	return {
		kind: 'event',
		deliveryId,
		eventType: action ? `${eventName}.${action}` : eventName,
		externalAccountId: installation?.id != null ? String(installation.id) : null,
	};
}
