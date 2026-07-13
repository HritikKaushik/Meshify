import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM. ORG_KEY_ENCRYPTION_KEY is an arbitrary-length operator-chosen
// string; hashing it to 32 bytes means any reasonably long passphrase works
// as the key material without a separate key-derivation step to configure.
function deriveKey(encryptionKey: string): Buffer {
	return createHash('sha256').update(encryptionKey).digest();
}

/** Encrypts `plaintext`, returning `iv.authTag.ciphertext` (each base64). */
export function encryptSecret(encryptionKey: string, plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveKey(encryptionKey), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.');
}

/** Inverse of {@link encryptSecret}. Throws if the payload was tampered with or the key is wrong. */
export function decryptSecret(encryptionKey: string, encrypted: string): string {
	const [ivB64, authTagB64, ciphertextB64] = encrypted.split('.');
	if (!ivB64 || !authTagB64 || !ciphertextB64) {
		throw new Error('Malformed encrypted secret — expected "iv.authTag.ciphertext"');
	}
	const decipher = createDecipheriv('aes-256-gcm', deriveKey(encryptionKey), Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
	const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
	return plaintext.toString('utf8');
}
