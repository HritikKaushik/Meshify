import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM. The encryption key is an arbitrary-length operator-chosen
// string; hashing it to 32 bytes means any reasonably long passphrase works
// as the key material without a separate key-derivation step to configure.
function deriveKey(encryptionKey: string): Buffer {
	return createHash('sha256').update(encryptionKey).digest();
}

// Envelope version tag. Bumping it (v2, …) lets a future key/algorithm change
// coexist with old ciphertexts instead of forcing a flag-day re-encryption.
const ENVELOPE_VERSION = 'v1';

/** Encrypts `plaintext`, returning a versioned `v1.iv.authTag.ciphertext` envelope (parts base64). */
export function encryptSecret(encryptionKey: string, plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveKey(encryptionKey), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const parts = [iv, authTag, ciphertext].map((b) => b.toString('base64'));
	return [ENVELOPE_VERSION, ...parts].join('.');
}

/**
 * Inverse of {@link encryptSecret}. Also accepts the pre-versioning
 * `iv.authTag.ciphertext` envelope (same algorithm) so secrets written before
 * v1 keep decrypting. Throws if the payload was tampered with or the key is wrong.
 */
export function decryptSecret(encryptionKey: string, encrypted: string): string {
	const parts = encrypted.split('.');
	const [ivB64, authTagB64, ciphertextB64] = parts[0] === ENVELOPE_VERSION ? parts.slice(1) : parts;
	if (!ivB64 || !authTagB64 || !ciphertextB64) {
		throw new Error('Malformed encrypted secret — expected "[v1.]iv.authTag.ciphertext"');
	}
	const decipher = createDecipheriv('aes-256-gcm', deriveKey(encryptionKey), Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
	const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
	return plaintext.toString('utf8');
}
