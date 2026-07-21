import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, scryptSync } from 'node:crypto';

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

/**
 * Per-org key derivation (v3): HKDF-expand the scrypt key with the org context as
 * `info`, so each org gets DISTINCT key material and can be rotated independently
 * of others. NOTE: this derives from the single master, so it does NOT reduce
 * blast radius against a MASTER compromise — full cross-tenant isolation needs a
 * KMS/DEK-managed master (see docs/operations/ENCRYPTION.md). It does prevent one
 * org's key from being usable for another and enables per-org key operations.
 */
function deriveKeyV3(encryptionKey: string, salt: Buffer, context: string): Buffer {
	const prk = deriveKeyScrypt(encryptionKey, salt); // cached, expensive scrypt
	return Buffer.from(hkdfSync('sha256', prk, salt, Buffer.from(`org:${context}`), 32));
}

/**
 * Encrypts `plaintext`. With `context` (an org id), binds the ciphertext to that
 * org via a per-org derived key → `v3.salt.iv.authTag.ciphertext`; without it,
 * the shared-key `v2.salt.iv.authTag.ciphertext`. Parts are base64.
 */
export function encryptSecret(encryptionKey: string, plaintext: string, context?: string): string {
	const salt = randomBytes(SALT_BYTES);
	const iv = randomBytes(12);
	const version = context ? 'v3' : ENVELOPE_VERSION;
	const key = context ? deriveKeyV3(encryptionKey, salt, context) : deriveKeyScrypt(encryptionKey, salt);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const parts = [salt, iv, authTag, ciphertext].map((b) => b.toString('base64'));
	return [version, ...parts].join('.');
}

function gcmDecrypt(key: Buffer, ivB64: string, authTagB64: string, ciphertextB64: string): string {
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * Inverse of {@link encryptSecret}. Dispatches on the envelope version so all
 * three formats keep decrypting without a flag-day re-encryption:
 *   - `v3.salt.iv.authTag.ciphertext` — per-org key (requires `context`).
 *   - `v2.salt.iv.authTag.ciphertext` — scrypt-derived shared key.
 *   - `v1.iv.authTag.ciphertext`      — SHA-256-derived key (legacy).
 *   - `iv.authTag.ciphertext`         — SHA-256, pre-versioning (legacy).
 * Pass the same `context` used at encryption for v3 payloads (ignored otherwise —
 * so callers can always pass it, and pre-v3 rows still decrypt). Throws if the
 * payload was tampered with, the key is wrong, or a v3 payload's context is missing/wrong.
 */
export function decryptSecret(encryptionKey: string, encrypted: string, context?: string): string {
	const parts = encrypted.split('.');

	if (parts[0] === 'v3') {
		if (!context) throw new Error('v3 encrypted secret requires its org context to decrypt');
		const [saltB64, ivB64, authTagB64, ciphertextB64] = parts.slice(1);
		if (!saltB64 || !ivB64 || !authTagB64 || !ciphertextB64) {
			throw new Error('Malformed encrypted secret — expected "v3.salt.iv.authTag.ciphertext"');
		}
		return gcmDecrypt(deriveKeyV3(encryptionKey, Buffer.from(saltB64, 'base64'), context), ivB64, authTagB64, ciphertextB64);
	}

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
