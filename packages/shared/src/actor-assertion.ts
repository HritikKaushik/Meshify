import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The BFF's signed statement of who a forwarded request is acting for.
 *
 * platform-api used to trust plain headers from the BFF, so anyone holding an
 * org's shared API key could claim to be any user with any role. The assertion
 * binds a person (`sub`, a `users.id`) to an org for a short window, signed with
 * a secret only the BFF and platform-api hold: the key alone can no longer act
 * as a user, and an assertion minted for one org cannot be replayed with
 * another org's key.
 *
 * It carries identity only - never a role. platform-api resolves authority from
 * its own tables on every request.
 *
 * HMAC rather than a JWT: the verifier is the party being protected, so public
 * key distribution buys nothing, and this needs no dependency.
 */
export const ACTOR_ASSERTION_HEADER = 'x-meshify-actor';

const VERSION = 'v1';
const DEFAULT_TTL_SECONDS = 60;
const DEFAULT_SKEW_SECONDS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActorAssertionPayload {
	/** `users.id` of the person the request acts for. */
	sub: string;
	/** `organizations.id` the assertion is valid for. */
	org: string;
	/** Issued-at, seconds since the epoch. */
	iat: number;
	/** Expiry, seconds since the epoch. */
	exp: number;
}

export type ActorAssertionFailure = 'malformed' | 'bad_signature' | 'expired' | 'not_yet_valid';

export type ActorAssertionResult = { ok: true; payload: ActorAssertionPayload } | { ok: false; reason: ActorAssertionFailure };

export interface SignActorAssertionOptions {
	/** Milliseconds since the epoch; defaults to `Date.now()`. */
	now?: number;
	ttlSeconds?: number;
}

export interface VerifyActorAssertionOptions {
	/** Milliseconds since the epoch; defaults to `Date.now()`. */
	now?: number;
	/** Clock skew tolerated between the BFF and platform-api hosts. */
	skewSeconds?: number;
}

function sign(secret: string, signingInput: string): Buffer {
	return createHmac('sha256', secret).update(signingInput).digest();
}

export function signActorAssertion(secret: string, subject: { sub: string; org: string }, options: SignActorAssertionOptions = {}): string {
	if (!secret) throw new Error('signActorAssertion requires a secret');
	const iat = Math.floor((options.now ?? Date.now()) / 1000);
	const payload: ActorAssertionPayload = { sub: subject.sub, org: subject.org, iat, exp: iat + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS) };
	const signingInput = `${VERSION}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
	return `${signingInput}.${sign(secret, signingInput).toString('base64url')}`;
}

export function verifyActorAssertion(secret: string, token: string | undefined, options: VerifyActorAssertionOptions = {}): ActorAssertionResult {
	if (!secret || !token) return { ok: false, reason: 'malformed' };
	const parts = token.split('.');
	if (parts.length !== 3 || parts[0] !== VERSION || !parts[1] || !parts[2]) return { ok: false, reason: 'malformed' };

	// Verify the signature before parsing anything the caller controls.
	const expected = sign(secret, `${parts[0]}.${parts[1]}`);
	const presented = Buffer.from(parts[2], 'base64url');
	if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return { ok: false, reason: 'bad_signature' };

	const payload = parsePayload(parts[1]);
	if (!payload) return { ok: false, reason: 'malformed' };

	const now = Math.floor((options.now ?? Date.now()) / 1000);
	const skew = options.skewSeconds ?? DEFAULT_SKEW_SECONDS;
	if (payload.iat - skew > now) return { ok: false, reason: 'not_yet_valid' };
	if (payload.exp + skew < now) return { ok: false, reason: 'expired' };
	return { ok: true, payload };
}

function parsePayload(encoded: string): ActorAssertionPayload | undefined {
	let raw: unknown;
	try {
		raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
	} catch {
		return undefined;
	}
	if (typeof raw !== 'object' || raw === null) return undefined;
	const { sub, org, iat, exp } = raw as Record<string, unknown>;
	if (typeof sub !== 'string' || !UUID.test(sub)) return undefined;
	if (typeof org !== 'string' || !UUID.test(org)) return undefined;
	if (typeof iat !== 'number' || typeof exp !== 'number' || !Number.isFinite(iat) || !Number.isFinite(exp) || exp < iat) return undefined;
	return { sub, org, iat, exp };
}
