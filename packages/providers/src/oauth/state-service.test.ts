import { describe, expect, it } from 'vitest';
import { OAuthStateService, hashStateToken } from './state-service.js';
import { InMemoryOAuthStateStore } from '../testing/fakes.js';

const NOW = new Date('2026-01-01T12:00:00.000Z');

function service(nowRef: { now: Date } = { now: NOW }) {
	const store = new InMemoryOAuthStateStore();
	return { store, nowRef, service: new OAuthStateService(store, 15 * 60 * 1000, () => nowRef.now) };
}

describe('OAuthStateService', () => {
	it('issues a high-entropy token and stores only its hash', async () => {
		const { store, service: states } = service();
		const { token, state } = await states.issue({ orgId: 'org-1', provider: 'github', projectId: 'proj-1', returnPath: '/x' });
		expect(token.length).toBeGreaterThanOrEqual(43); // 32 random bytes base64url
		expect(state.stateHash).toBe(hashStateToken(token));
		expect(store.states.has(token)).toBe(false); // raw token never stored
		expect(store.states.get(state.stateHash)?.projectId).toBe('proj-1');
	});

	it('consumes a valid token exactly once', async () => {
		const { service: states } = service();
		const { token } = await states.issue({ orgId: 'org-1', provider: 'github' });
		const consumed = await states.consume(token);
		expect(consumed?.orgId).toBe('org-1');
		expect(await states.consume(token)).toBeUndefined(); // replay
	});

	it('rejects expired and unknown tokens indistinguishably', async () => {
		const nowRef = { now: NOW };
		const { service: states } = service(nowRef);
		const { token } = await states.issue({ orgId: 'org-1', provider: 'slack' });
		nowRef.now = new Date(NOW.getTime() + 16 * 60 * 1000);
		expect(await states.consume(token)).toBeUndefined(); // expired
		expect(await states.consume('never-issued')).toBeUndefined(); // unknown
	});
});
