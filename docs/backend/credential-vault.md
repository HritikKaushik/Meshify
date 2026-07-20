---
title: Credential Vault & Provider Registration
purpose: How application- and runtime-level secrets are stored, encrypted, scoped, and rotated.
audience: Backend and security engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - provider-platform.md
  - byoa-guide.md
---

# Credential Vault & Provider Registration

> Two credential classes, one vault. **Provider Registrations** own
> application-level secrets (private keys, client secrets, webhook secrets);
> **Integrations** own runtime secrets (installation/bot/refresh tokens).
> Nothing above the vault ever sees ciphertext; nothing below it sees plaintext;
> nothing outside it decrypts.

## Storage & encryption

- **Encryption** — AES-256-GCM, key = SHA-256 of the operator secret
  (`INTEGRATION_ENCRYPTION_KEY`, falling back to `ORG_KEY_ENCRYPTION_KEY`).
  Envelope is **versioned** (`v1.iv.tag.ct`, base64) so a future key/algorithm
  change coexists with old ciphertexts; `decryptSecret` also reads the legacy
  pre-v1 envelope. See `packages/data-access/src/provisioning/secret-encryption.ts`.
- **Tables** — `integration_credentials` (runtime, per `integration_id` + kind)
  and `provider_registration_credentials` (app-level, per `registration_id` +
  kind). Both structurally satisfy the vault's `CredentialStore` port, so **one
  `CredentialVault` class serves both** — the platform-api constructs two
  instances (integration vault, registration vault) over the two stores.

## Scoping

Providers never receive the vault — only a `VaultHandle` scoped to one owner
(`vault.forIntegration(id)`). A provider cannot read another integration's or
registration's secrets by construction. Managed-registration secrets come from
env via a **read-only** handle (`put`/`delete` throw).

## Credential kinds

| Kind | Owner | Notes |
| --- | --- | --- |
| `access_token`, `refresh_token` | integration | Slack bot/rotation tokens |
| `installation_token` | integration | GitHub, minted on demand, DB-cached (shared across workers), refreshed <5 min before expiry |
| `app_private_key`, `app_client_secret`, `app_signing_secret`, `app_webhook_secret` | registration | BYOA app credentials (write-only in the UI) |

## Rotation

- **Slack tokens** — the maintenance `refresh` sweep (every 15 min) rotates any
  credential expiring within 30 min via `refreshCredentials`; a dead refresh
  token flips health to `needs_reauthorization` and emits `health.changed`.
- **GitHub installation tokens** — never stored long-term; minted lazily and
  re-minted when the DB-cached one is within its expiry margin.
- **Operator keys** — rotate `INTEGRATION_ENCRYPTION_KEY` by introducing a new
  envelope version; the versioned format avoids a flag-day.

## Never

- No secret is returned in any DTO (BYOA describe reports only a `configured`
  boolean per field).
- No secret is logged — the shared logger redacts `authorization`/`cookie`;
  provider payloads and credentials are never passed to the logger.

---
[← Handbook](../README.md)
