import { describe, expect, it } from 'vitest';
import { signActorAssertion, verifyActorAssertion } from './actor-assertion.js';

const SECRET = 'unit-test-assertion-secret-not-a-real-key';
const SUB = '3f1c2b9e-5a4d-4c7e-9b1a-2d6e8f0a1b2c';
const ORG = '7a9d4e21-0b3c-4f5a-8e6d-1c2b3a4f5e6d';
const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);

describe('actor assertion', () => {
	it('round-trips the subject and org, valid for sixty seconds by default', () => {
		const token = signActorAssertion(SECRET, { sub: SUB, org: ORG }, { now: NOW });
		const result = verifyActorAssertion(SECRET, token, { now: NOW + 30_000 });
		expect(result).toEqual({ ok: true, payload: { sub: SUB, org: ORG, iat: NOW / 1000, exp: NOW / 1000 + 60 } });
	});

	it('rejects a token signed with a different secret', () => {
		const token = signActorAssertion('another-secret-another-secret-0123', { sub: SUB, org: ORG }, { now: NOW });
		expect(verifyActorAssertion(SECRET, token, { now: NOW })).toEqual({ ok: false, reason: 'bad_signature' });
	});

	it('rejects a payload swapped for another subject under the original signature', () => {
		const [version, , signature] = signActorAssertion(SECRET, { sub: SUB, org: ORG }, { now: NOW }).split('.');
		const forged = Buffer.from(JSON.stringify({ sub: ORG, org: ORG, iat: NOW / 1000, exp: NOW / 1000 + 60 })).toString('base64url');
		expect(verifyActorAssertion(SECRET, `${version}.${forged}.${signature}`, { now: NOW })).toEqual({ ok: false, reason: 'bad_signature' });
	});

	it('expires after its ttl plus the allowed skew, and not before', () => {
		const token = signActorAssertion(SECRET, { sub: SUB, org: ORG }, { now: NOW });
		expect(verifyActorAssertion(SECRET, token, { now: NOW + 65_000 }).ok).toBe(true);
		expect(verifyActorAssertion(SECRET, token, { now: NOW + 66_000 })).toEqual({ ok: false, reason: 'expired' });
	});

	it('rejects a token issued further in the future than the allowed skew', () => {
		const token = signActorAssertion(SECRET, { sub: SUB, org: ORG }, { now: NOW + 6_000 });
		expect(verifyActorAssertion(SECRET, token, { now: NOW })).toEqual({ ok: false, reason: 'not_yet_valid' });
		expect(verifyActorAssertion(SECRET, signActorAssertion(SECRET, { sub: SUB, org: ORG }, { now: NOW + 5_000 }), { now: NOW }).ok).toBe(true);
	});

	it('treats a missing, truncated, wrong-version or non-uuid token as malformed', () => {
		const token = signActorAssertion(SECRET, { sub: SUB, org: ORG }, { now: NOW });
		expect(verifyActorAssertion(SECRET, undefined, { now: NOW })).toEqual({ ok: false, reason: 'malformed' });
		expect(verifyActorAssertion(SECRET, token.split('.').slice(0, 2).join('.'), { now: NOW })).toEqual({ ok: false, reason: 'malformed' });
		expect(verifyActorAssertion(SECRET, token.replace(/^v1/, 'v2'), { now: NOW })).toEqual({ ok: false, reason: 'malformed' });
		const notUuid = signActorAssertion(SECRET, { sub: 'user_2abc', org: ORG }, { now: NOW });
		expect(verifyActorAssertion(SECRET, notUuid, { now: NOW })).toEqual({ ok: false, reason: 'malformed' });
	});

	it('never verifies without a secret, and refuses to sign without one', () => {
		const token = signActorAssertion(SECRET, { sub: SUB, org: ORG }, { now: NOW });
		expect(verifyActorAssertion('', token, { now: NOW })).toEqual({ ok: false, reason: 'malformed' });
		expect(() => signActorAssertion('', { sub: SUB, org: ORG })).toThrow();
	});
});
