import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-encryption.js';

const KEY = 'a-test-encryption-key-of-decent-length';

/** Builds a legacy AES-256-GCM ciphertext (SHA-256-derived key), optionally v1-prefixed. */
function legacyCiphertext(key: string, plaintext: string, withV1Prefix: boolean): string {
	const derived = createHash('sha256').update(key).digest();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', derived, iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const parts = [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64'));
	return withV1Prefix ? ['v1', ...parts].join('.') : parts.join('.');
}

describe('secret-encryption', () => {
	it('round-trips through the current v2 (scrypt) envelope', () => {
		const ciphertext = encryptSecret(KEY, 'xoxb-super-secret');
		expect(ciphertext.startsWith('v2.')).toBe(true);
		expect(ciphertext.split('.')).toHaveLength(5); // v2.salt.iv.authTag.ciphertext
		expect(decryptSecret(KEY, ciphertext)).toBe('xoxb-super-secret');
	});

	it('round-trips through the v3 (per-org) envelope with matching context', () => {
		const ciphertext = encryptSecret(KEY, 'msk_org_key', 'org-123');
		expect(ciphertext.startsWith('v3.')).toBe(true);
		expect(decryptSecret(KEY, ciphertext, 'org-123')).toBe('msk_org_key');
	});

	it('a v3 secret cannot be decrypted with a different org context', () => {
		const ciphertext = encryptSecret(KEY, 'msk_org_key', 'org-123');
		expect(() => decryptSecret(KEY, ciphertext, 'org-999')).toThrow();
	});

	it('a v3 secret requires a context to decrypt', () => {
		const ciphertext = encryptSecret(KEY, 'msk_org_key', 'org-123');
		expect(() => decryptSecret(KEY, ciphertext)).toThrow(/context/);
	});

	it('a passed context is ignored for pre-v3 (v2) payloads', () => {
		const v2 = encryptSecret(KEY, 'legacy-value');
		expect(decryptSecret(KEY, v2, 'org-irrelevant')).toBe('legacy-value');
	});

	it('per-org keys differ: same plaintext under two orgs is not interchangeable', () => {
		const a = encryptSecret(KEY, 'same', 'org-A');
		const b = encryptSecret(KEY, 'same', 'org-B');
		expect(() => decryptSecret(KEY, a, 'org-B')).toThrow();
		expect(decryptSecret(KEY, a, 'org-A')).toBe('same');
		expect(decryptSecret(KEY, b, 'org-B')).toBe('same');
	});

	it('still decrypts legacy v1-prefixed envelopes (SHA-256 key)', () => {
		const v1 = legacyCiphertext(KEY, 'legacy-v1-token', true);
		expect(v1.split('.')).toHaveLength(4);
		expect(decryptSecret(KEY, v1)).toBe('legacy-v1-token');
	});

	it('still decrypts pre-versioning "iv.tag.ct" envelopes (SHA-256 key)', () => {
		const preV1 = legacyCiphertext(KEY, 'legacy-org-api-key', false);
		expect(preV1.split('.')).toHaveLength(3);
		expect(decryptSecret(KEY, preV1)).toBe('legacy-org-api-key');
	});

	it('produces a fresh salt + IV per encryption', () => {
		const a = encryptSecret(KEY, 'same').split('.');
		const b = encryptSecret(KEY, 'same').split('.');
		expect(a[1]).not.toBe(b[1]); // salt differs
		expect(a[2]).not.toBe(b[2]); // iv differs
	});

	it('rejects tampered ciphertexts', () => {
		const parts = encryptSecret(KEY, 'payload').split('.');
		const body = Buffer.from(parts[4]!, 'base64'); // ciphertext is the 5th part in v2
		body[0] = body[0]! ^ 0xff;
		const tampered = [parts[0], parts[1], parts[2], parts[3], body.toString('base64')].join('.');
		expect(() => decryptSecret(KEY, tampered)).toThrow();
	});

	it('rejects the wrong key', () => {
		const ciphertext = encryptSecret(KEY, 'payload');
		expect(() => decryptSecret('another-key-entirely-with-length', ciphertext)).toThrow();
	});

	it('rejects malformed envelopes', () => {
		expect(() => decryptSecret(KEY, 'not-an-envelope')).toThrow(/Malformed/);
		expect(() => decryptSecret(KEY, 'v2.only.three.parts')).toThrow(/Malformed/);
		expect(() => decryptSecret(KEY, 'v1.only-two.parts')).toThrow(/Malformed/);
	});
});
