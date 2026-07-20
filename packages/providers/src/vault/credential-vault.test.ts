import { describe, expect, it } from 'vitest';
import { CredentialVault } from './credential-vault.js';
import { InMemoryCredentialStore, fakeCipher } from '../testing/fakes.js';

const NOW = new Date('2026-01-01T12:00:00.000Z');

function vaultWith(now: Date = NOW) {
	const store = new InMemoryCredentialStore();
	return { store, vault: new CredentialVault(store, fakeCipher, () => now) };
}

describe('CredentialVault', () => {
	it('encrypts on put and decrypts on get — plaintext never reaches the store', async () => {
		const { store, vault } = vaultWith();
		await vault.put('int-1', 'access_token', 'xoxb-secret');
		expect(store.rows.get('int-1:access_token')?.encryptedValue).toBe('enc(xoxb-secret)');
		expect(await vault.get('int-1', 'access_token')).toEqual({ value: 'xoxb-secret', expiresAt: null });
	});

	it('treats credentials expiring within minTtlMs as absent (mint-fresh signal)', async () => {
		const { vault } = vaultWith();
		await vault.put('int-1', 'installation_token', 'ghs_1', new Date(NOW.getTime() + 2 * 60 * 1000));
		expect(await vault.get('int-1', 'installation_token')).toBeDefined();
		expect(await vault.get('int-1', 'installation_token', { minTtlMs: 5 * 60 * 1000 })).toBeUndefined();
	});

	it('treats hard-expired credentials as absent even without a margin', async () => {
		const { vault } = vaultWith();
		await vault.put('int-1', 'access_token', 'stale', new Date(NOW.getTime() - 1000));
		expect(await vault.get('int-1', 'access_token')).toBeUndefined();
	});

	it('purge removes every credential of an integration and only that integration', async () => {
		const { vault } = vaultWith();
		await vault.put('int-1', 'access_token', 'a');
		await vault.put('int-1', 'refresh_token', 'b');
		await vault.put('int-2', 'access_token', 'c');
		await vault.purge('int-1');
		expect(await vault.get('int-1', 'access_token')).toBeUndefined();
		expect(await vault.get('int-1', 'refresh_token')).toBeUndefined();
		expect(await vault.get('int-2', 'access_token')).toEqual({ value: 'c', expiresAt: null });
	});

	it('forIntegration scopes reads and writes to one integration', async () => {
		const { vault } = vaultWith();
		const handle = vault.forIntegration('int-1');
		await handle.put('access_token', 'scoped');
		expect(await vault.get('int-1', 'access_token')).toEqual({ value: 'scoped', expiresAt: null });
		expect(await vault.get('int-2', 'access_token')).toBeUndefined();
		await handle.delete('access_token');
		expect(await handle.get('access_token')).toBeUndefined();
	});
});
