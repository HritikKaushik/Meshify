# Meshify — Secret Rotation Checklist

**Operator action.** The working-tree `.env` has held live-looking credentials
during development. If this tree was ever shared, pushed, or backed up, rotate
them. Rotation of external provider keys must be done in each provider's console —
it can't be automated from here. Work top-to-bottom; the two crypto keys have
special blast radius, called out below.

## Provider / auth credentials (rotate in the provider console, then update env)
| Secret | Rotate where | Impact of rotation |
|---|---|---|
| `CLERK_SECRET_KEY` (+ move to a `pk_live_`/`sk_live_` pair for prod) | Clerk dashboard → API keys | Existing sessions unaffected; the BFF re-validates with the new key on next request |
| `ROCKETRIDE_APIKEY` | RocketRide account | New pipelines/chat use the new key immediately |
| `ROCKETRIDE_OPENAI_KEY` | OpenAI dashboard → API keys | Managed embeddings/LLM fallback; re-embedding not required |
| `ROCKETRIDE_GEMINI_KEY` | Google AI Studio | Managed Gemini path only |
| `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Slack app config | Re-verify webhook signatures with the new signing secret; existing OAuth tokens unaffected |
| `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_SECRET` | GitHub App settings | Installation tokens re-mint automatically; webhook HMAC uses the new secret |
| `S3_SECRET_ACCESS_KEY`, `QDRANT_API_KEY`, `DATABASE_URL` (password), `REDIS_URL` (password) | Backblaze B2 (Application Keys) / Qdrant Cloud / Neon / Upstash consoles | Update env + redeploy; no data change |

Standard flow: create the new key → set it in the secret store (Render dashboard /
K8s Secret) → redeploy → revoke the old key.

## `PLATFORM_API_KEY_PEPPER` — ⚠️ invalidates all issued API keys
It peppers every stored API-key hash, so rotating it makes **every `msk_` key
un-verifiable**. After rotation:
1. Set the new value on platform-api **and** the BFF (must be byte-identical).
2. Re-issue org keys: the BFF auto-reprovisions Clerk orgs on next request; for any
   out-of-band server keys, re-run `pnpm --filter @meshify/data-access issue-api-key`.

## `ORG_KEY_ENCRYPTION_KEY` / `INTEGRATION_ENCRYPTION_KEY` — ⚠️ encrypts data at rest
These decrypt every stored org key + integration/LLM/Slack credential (and the
BFF-stored org key). **Rotating the value alone makes existing ciphertext
undecryptable.** Two safe paths:
- **Re-encrypt (preferred):** decrypt-all with the old key, re-encrypt with the new
  one in a maintenance script, within one deploy. (The `v2/v3` envelope tags which
  key/derivation produced each ciphertext, enabling a staged migration.)
- **Re-connect:** rotate the key, then have each org re-connect its integrations and
  re-enter provider credentials (they get re-encrypted under the new key).
Never rotate these casually — losing the current value with no backup means every
stored credential is unrecoverable (see [BACKUP_DR.md](BACKUP_DR.md)).

## Generate strong values
```bash
openssl rand -base64 32   # any of the crypto keys / METRICS_TOKEN
```
Placeholder / low-entropy values for the crypto keys are rejected at boot in
production (`@meshify/config`).

## After rotating
- Confirm boot (`/health/ready` 200) and a real ingest→chat round-trip.
- Purge the old values from any shared location (chat logs, backups, CI logs).
