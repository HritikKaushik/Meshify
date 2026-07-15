import { describe, expect, it } from 'vitest';
import { signState, verifyState } from './oauth-state.js';

const SECRET = 'a-server-only-signing-secret';

describe('oauth-state', () => {
	it('round-trips the projectId through a signed token', () => {
		const token = signState({ projectId: 'proj-9' }, SECRET, 1_000_000);
		const state = verifyState(token, SECRET, 1_000_500);
		expect(state.projectId).toBe('proj-9');
		expect(state.nonce).toHaveLength(32);
	});

	it('rejects a token signed with a different secret (CSRF/tamper)', () => {
		const token = signState({ projectId: 'p' }, SECRET, 0);
		expect(() => verifyState(token, 'a-different-secret', 0)).toThrow(/signature/);
	});

	it('rejects an expired token', () => {
		const token = signState({ projectId: 'p' }, SECRET, 0);
		expect(() => verifyState(token, SECRET, 16 * 60 * 1000)).toThrow(/expired/);
	});
});
