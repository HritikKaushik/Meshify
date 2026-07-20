---
title: Enterprise BYOA Guide
purpose: How an organization brings its own provider app (Bring-Your-Own-App) instead of Meshify's managed one.
audience: Backend engineers, enterprise onboarding.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - credential-vault.md
  - oauth-guide.md
  - webhook-guide.md
---

# Enterprise BYOA Guide

> Managed is the default: an org installs Meshify's app. Enterprise customers
> can instead register **their own** provider app. This is a **Provider
> Registration** in `byoa` mode — the layer that made BYOA possible without a
> circular dependency.

## Why a registration, not per-integration config

OAuth needs app credentials *before* an integration exists (to build the consent
URL and verify the callback). So app credentials live one layer up, on the
**org's Provider Registration**, resolved at connect time. See
[Credential Vault](credential-vault.md) for the ownership split.

## Configuring BYOA

Org-and-provider scoped (not per-integration):

```
GET  /v1/providers/:provider/registration    # the provider-declared form + configured flags (secrets never echoed)
PUT  /v1/providers/:provider/registration     # store the org's app credentials; returns the webhook URL
```

The form is **provider-declared** (`ByoaCapable.describeByoaConfig()`), so the
endpoint and UI hold no provider knowledge. On save:

- Non-secret fields (app id, client id, redirect uri) → the registration's `config`.
- Secret fields (private key, client/signing/webhook secret) → the **registration
  vault** (`provider_registration_credentials`), write-only. A blank secret on
  update keeps the stored value (validated against the true stored value,
  decrypted in memory, never returned).
- The org is switched to `byoa` for **future** connects. Existing integrations
  keep the registration they connected through (app-bound; a GitHub installation
  cannot be retargeted to a different app).
- The response returns the **per-registration webhook URL**
  (`/v1/integrations/webhooks/:provider/:registrationId`) to paste into the
  org's app config.

## What an org supplies

- **GitHub** — App ID, App slug, private key (PEM), webhook secret.
- **Slack** — Client ID, client secret, signing secret.
- Future providers declare their own fields.

## Verification & runtime

Once configured, connects, token minting, resource listing, health checks, and
webhook verification all resolve **that org's app** via the registration —
identical code path to managed, different credential source. No provider code
special-cases BYOA.

---
[← Handbook](../README.md)
