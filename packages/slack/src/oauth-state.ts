import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signed OAuth `state`. Because Slack's redirect URI is static (it cannot carry
 * `:projectId` in the path), the projectId travels here, protected against
 * tampering by an HMAC keyed with a server-only secret. A random nonce provides
 * CSRF protection, and `issuedAt` bounds replay.
 */
export interface SlackOAuthState {
	projectId: string;
	nonce: string;
	issuedAt: number;
}

const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes to complete the OAuth round-trip

function base64url(input: string): string {
	return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Encodes `<base64url(json)>.<hmac>`. Only the holder of `secret` can produce a valid token. */
export function signState(state: Omit<SlackOAuthState, 'nonce' | 'issuedAt'> & Partial<SlackOAuthState>, secret: string, now: number): string {
	const full: SlackOAuthState = {
		projectId: state.projectId,
		nonce: state.nonce ?? randomBytes(16).toString('hex'),
		issuedAt: state.issuedAt ?? now,
	};
	const payload = base64url(JSON.stringify(full));
	return `${payload}.${sign(payload, secret)}`;
}

/** Verifies signature + TTL and returns the decoded state, or throws. */
export function verifyState(token: string, secret: string, now: number): SlackOAuthState {
	const [payload, signature] = token.split('.');
	if (!payload || !signature) throw new Error('Malformed OAuth state');

	const expected = sign(payload, secret);
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('OAuth state signature mismatch');

	const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SlackOAuthState;
	if (typeof state.projectId !== 'string' || typeof state.issuedAt !== 'number') throw new Error('Invalid OAuth state payload');
	if (now - state.issuedAt > STATE_TTL_MS) throw new Error('OAuth state expired — please restart the Slack connection');
	return state;
}
