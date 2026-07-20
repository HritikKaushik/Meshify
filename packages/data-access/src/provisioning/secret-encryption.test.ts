import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-encryption.js';

const KEY = 'a-test-encryption-key-of-decent-length';

describe('secret-encryption', () => {
	it('round-trips through the versioned envelope', () => {
		const ciphertext = encryptSecret(KEY, 'xoxb-super-secret');
		expect(ciphertext.startsWith('v1.')).toBe(true);
		expect(ciphertext.split('.')).toHaveLength(4);
		expect(decryptSecret(KEY, ciphertext)).toBe('xoxb-super-secret');
	});

	it('still decrypts pre-versioning "iv.tag.ct" envelopes', () => {
		// Simulate a legacy ciphertext by stripping the version tag — the
		// algorithm is unchanged, only the envelope grew a prefix.
		const legacy = encryptSecret(KEY, 'legacy-org-api-key').replace(/^v1\./, '');
		expect(legacy.split('.')).toHaveLength(3);
		expect(decryptSecret(KEY, legacy)).toBe('legacy-org-api-key');
	});

	it('produces a fresh IV per encryption', () => {
		expect(encryptSecret(KEY, 'same')).not.toBe(encryptSecret(KEY, 'same'));
	});

	it('rejects tampered ciphertexts', () => {
		const ciphertext = encryptSecret(KEY, 'payload');
		const parts = ciphertext.split('.');
		const tamperedBody = Buffer.from(parts[3]!, 'base64');
		tamperedBody[0] = tamperedBody[0]! ^ 0xff;
		const tampered = [parts[0], parts[1], parts[2], tamperedBody.toString('base64')].join('.');
		expect(() => decryptSecret(KEY, tampered)).toThrow();
	});

	it('rejects the wrong key', () => {
		const ciphertext = encryptSecret(KEY, 'payload');
		expect(() => decryptSecret('another-key-entirely-with-length', ciphertext)).toThrow();
	});

	it('rejects malformed envelopes', () => {
		expect(() => decryptSecret(KEY, 'not-an-envelope')).toThrow(/Malformed/);
		expect(() => decryptSecret(KEY, 'v1.only-two.parts')).toThrow(/Malformed/);
	});
});
