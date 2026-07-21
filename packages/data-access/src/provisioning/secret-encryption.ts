import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

// AES-256-GCM with a scrypt-derived key (v2 envelope). The encryption key is an
// arbitrary-length operator-chosen string; scrypt with a per-secret random salt
// turns it into 32 bytes of key material while resisting brute force of a weak
// passphrase FAR better than a single SHA-256 (v1). @meshify/config additionally
// rejects placeholder/low-entropy keys in production.
const ENVELOPE_VERSION = 'v2';
// scrypt cost. N=2^14 → ~16MB / tens of ms. Thanks to the derived-key cache below
// this runs at most once per distinct ciphertext per process, never per operation.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;

/**
 * Bounded cache of scrypt-derived keys, keyed by (key fingerprint, salt). A
 * stored ciphertext's salt never changes, so repeated decryptions of the SAME
 * secret reuse the derived key instead of re-running scrypt — critical for hot
 * paths like the BFF decrypting an org's API key on every request. First use of
 * each distinct salt pays the KDF cost once.
 */
const derivedKeyCache = new Map<string, Buffer>();
const DERIVED_KEY_CACHE_MAX = 500;

/** Non-reversible tag so the cache key never holds the raw passphrase or its bare hash. */
function keyFingerprint(encryptionKey: string): string {
	return createHash('sha256').update(`kdf-cache:${encryptionKey}`).digest('base64');
}

function deriveKeyScrypt(encryptionKey: string, salt: Buffer): Buffer {
	const cacheKey = `${keyFingerprint(encryptionKey)}:${salt.toString('base64')}`;
	const cached = derivedKeyCache.get(cacheKey);
	if (cached) return cached;

	const derived = scryptSync(encryptionKey, salt, 32, SCRYPT_PARAMS);
	if (derivedKeyCache.size >= DERIVED_KEY_CACHE_MAX) {
		const oldest = derivedKeyCache.keys().next().value; // FIFO eviction
		if (oldest !== undefined) derivedKeyCache.delete(oldest);
	}
	derivedKeyCache.set(cacheKey, derived);
	return derived;
}

/** Legacy key derivation for v1 / pre-v1 envelopes: a bare SHA-256 of the key. */
function deriveKeyLegacy(encryptionKey: string): Buffer {
	return createHash('sha256').update(encryptionKey).digest();
}

/** Encrypts `plaintext`, returning a versioned `v2.salt.iv.authTag.ciphertext` envelope (parts base64). */
export function encryptSecret(encryptionKey: string, plaintext: string): string {
	const salt = randomBytes(SALT_BYTES);
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', deriveKeyScrypt(encryptionKey, salt), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const parts = [salt, iv, authTag, ciphertext].map((b) => b.toString('base64'));
	return [ENVELOPE_VERSION, ...parts].join('.');
}

function gcmDecrypt(key: Buffer, ivB64: string, authTagB64: string, ciphertextB64: string): string {
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * Inverse of {@link encryptSecret}. Dispatches on the envelope version so all
 * three formats keep decrypting without a flag-day re-encryption:
 *   - `v2.salt.iv.authTag.ciphertext` — scrypt-derived key (current).
 *   - `v1.iv.authTag.ciphertext`      — SHA-256-derived key (legacy).
 *   - `iv.authTag.ciphertext`         — SHA-256, pre-versioning (legacy).
 * Throws if the payload was tampered with or the key is wrong.
 */
export function decryptSecret(encryptionKey: string, encrypted: string): string {
	const parts = encrypted.split('.');

	if (parts[0] === ENVELOPE_VERSION) {
		const [saltB64, ivB64, authTagB64, ciphertextB64] = parts.slice(1);
		if (!saltB64 || !ivB64 || !authTagB64 || !ciphertextB64) {
			throw new Error('Malformed encrypted secret — expected "v2.salt.iv.authTag.ciphertext"');
		}
		return gcmDecrypt(deriveKeyScrypt(encryptionKey, Buffer.from(saltB64, 'base64')), ivB64, authTagB64, ciphertextB64);
	}

	// Legacy v1 (version-prefixed) or pre-v1 (bare) — both SHA-256-derived.
	const [ivB64, authTagB64, ciphertextB64] = parts[0] === 'v1' ? parts.slice(1) : parts;
	if (!ivB64 || !authTagB64 || !ciphertextB64) {
		throw new Error('Malformed encrypted secret — expected "v2.salt.iv.authTag.ciphertext" or "[v1.]iv.authTag.ciphertext"');
	}
	return gcmDecrypt(deriveKeyLegacy(encryptionKey), ivB64, authTagB64, ciphertextB64);
}
