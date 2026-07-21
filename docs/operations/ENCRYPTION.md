# Meshify — Secret Encryption & Key Model

## How secrets are encrypted
All secrets at rest (org API keys, integration/LLM/Slack credentials, Slack OAuth
tokens) use **AES-256-GCM** with a key derived from an operator-supplied master
(`ORG_KEY_ENCRYPTION_KEY` / `INTEGRATION_ENCRYPTION_KEY`). The ciphertext is a
versioned envelope so formats can evolve without a flag-day re-encryption:

| Version | Key derivation | Notes |
|---|---|---|
| `v3.salt.iv.tag.ct` | HKDF( scrypt(master, salt), info=`org:<id>` ) | **Per-org** key material — requires the org context to decrypt. Used for the org API key. |
| `v2.salt.iv.tag.ct` | scrypt(master, per-secret salt) | Shared-master, per-secret key. Used elsewhere. |
| `v1.iv.tag.ct` / `iv.tag.ct` | SHA-256(master) | Legacy; still decrypts. |

Every secret already gets an **independent derived key** (random per-secret salt),
and scrypt (N=2¹⁴) makes a weak passphrase far harder to brute-force. A bounded
in-process cache keyed by salt avoids re-running scrypt on hot paths (e.g. the BFF
decrypting an org key per request).

## Per-org derivation (v3) — what it does and doesn't give you
`v3` binds a ciphertext to its org: the key is HKDF-expanded with the org id, so
each org has **distinct key material**, one org's key is never usable for another,
and a per-org key can be rotated independently. The org API key uses it today.

**Honest limit:** v3 still derives from the SINGLE master, so it does **not**
reduce blast radius against a *master* compromise — whoever holds the master can
derive every org's key. That is inherent to a single-secret design.

## The path to true per-tenant isolation (future)
Real cross-tenant isolation (a leaked/rotated key for org A is useless for org B,
and no single secret unlocks everything) needs **per-org key material managed
outside the app**:

- **Envelope encryption (DEK/KEK).** Give each org a random **data key (DEK)**;
  store it encrypted under a **key-encryption key (KEK)**. Data is encrypted with
  the org's DEK; only the KEK-wrapped DEKs live in the DB. Rotating the KEK re-wraps
  DEKs without touching ciphertext. Compromise of one DEK affects one org.
- **External KMS.** Make the KEK an AWS/GCP KMS key (never leaves the HSM); the app
  calls KMS to unwrap DEKs. This removes the master from app config entirely.

Both require threading an org/DEK context through the `CredentialVault` +
`SecretCipher` interface and a `org_data_keys` table — a deliberate, separately
scoped change. The `v3` envelope is the forward-compatible seam for it: the vault
can adopt per-org (or per-DEK) context the same way the org-link repo already has.
