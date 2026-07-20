---
title: OAuth Guide
purpose: The end-to-end OAuth/app-install flow for the Provider Platform, and its security properties.
audience: Backend and security engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - provider-platform.md
  - webhook-guide.md
  - byoa-guide.md
---

# OAuth Guide

> Every provider connects the same way: the org authorizes an app (managed or
> BYOA), the callback is verified server-side with app credentials resolved
> from the **Provider Registration**, and a single-use, org-bound state token
> makes the whole flow un-hijackable.

## Flow

```mermaid
sequenceDiagram
  participant B as Browser (web)
  participant API as platform-api
  participant PRS as ProviderRegistrationService
  participant P as Provider (GitHub/Slack)

  B->>API: POST /v1/integrations/:provider/connect {projectId?, returnPath?}
  API->>PRS: resolve(orgId, provider)  (managed env or BYOA row)
  API->>API: issue single-use state (hash stored, 15-min TTL, org-bound)
  API-->>B: { url }  (provider.buildConnectUrl(input, registration))
  B->>P: navigate to consent/install URL (carries state)
  P-->>B: redirect to /oauth/:provider/callback?...&state=...
  B->>API: POST /v1/integrations/:provider/callback {state, params}
  API->>API: consume state (atomic, single-use); assert orgId + provider match
  API->>PRS: resolve(orgId, provider)
  API->>P: completeConnect(params, registration)  — verify with app creds
  API->>API: create/update integration (registration_id, mode); store runtime creds in vault
  API-->>B: { returnPath, projectId, intent }
```

## Security properties

| Property | How it's guaranteed | Where |
| --- | --- | --- |
| **State is single-use** | `oauth_states` row consumed with `update … set consumed_at = now() where consumed_at is null and expires_at > now() returning *` — atomic, one winner | `postgres-oauth-state.repository.ts` |
| **Only the hash is stored** | the browser carries a 256-bit random token; the DB stores `HMAC/SHA-256` of it | `oauth/state-service.ts` |
| **Org binding (anti-hijack)** | completion rejects unless `state.orgId === req.auth.orgId` and provider matches — *before* any provider call. A guessable GitHub `installation_id` can't be claimed by another org | `complete-connect.usecase.ts` |
| **15-min TTL** | `expires_at` enforced in the atomic consume | `state-service.ts` |
| **Server-side token exchange** | `completeConnect` runs in platform-api; client secret / private key never reach the browser | providers |
| **No browser storage** | the callback resolves org/project/return-path entirely from the state row (replaced the old Slack `sessionStorage` hack) | `ProviderCallbackPage.tsx` |
| **App-bound registration** | the integration records the `registration_id` it connected through; runtime ops always resolve that same app | `ProviderRegistrationService.resolveForIntegration` |

## Failure handling

- **User cancels / denies** → provider redirects with `?error=`; the callback
  page shows a message and a "Back to projects" link. No rows created.
- **State expired / replayed / wrong org** → `InvalidOAuthStateError` → 400;
  all three are indistinguishable to the caller.
- **Provider rejects the callback** → `ProviderAuthError` → 400; no integration
  or credentials are created (verified by tests).
- **Provider not configured for the org** (no managed env, no BYOA) →
  `ProviderNotConfiguredError` → 503.

## Reconnect

`POST /v1/integrations/:id/reconnect` issues a fresh state (`intent:'reconnect'`,
carrying the integration id) and returns a new consent URL. Used for expired or
revoked grants and scope upgrades.

---
[← Handbook](../README.md)
