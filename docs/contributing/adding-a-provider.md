---
title: Adding a New Provider
purpose: The step-by-step guide to add a new knowledge/tool provider to the Meshify Provider Platform.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - ../backend/provider-platform.md
---

# Adding a New Provider

> Goal: adding a brand-new provider (GitLab, SharePoint, Jira, …) requires
> **implementing the Provider interface, registering it, and adding UI
> metadata** — no changes to the platform core, no migrations.

## 1. Scaffold the provider module

Create `packages/providers/src/<id>/`:

```
<id>/
  deps.ts            # provider deps (transportFactory + optional sync wiring)
  <id>.provider.ts   # the Provider class + manifest
  webhooks.ts        # signature verification + describe (if WebhookCapable)
  sync.ts            # executeSync (if SyncCapable)
  transport.ts       # real HTTP transport factory (thin; may live in its own @meshify/<id> package)
```

If the provider needs a non-trivial HTTP client, put it in a **transport
package** (`packages/<id>`) like `@meshify/github` / `@meshify/slack`, and keep
`packages/providers/src/<id>/` logic-only.

## 2. Write the manifest

```ts
export const X_MANIFEST: ProviderManifest = {
  id: 'gitlab',
  manifestVersion: CURRENT_MANIFEST_VERSION,   // registry rejects unsupported versions at boot
  providerVersion: '1.0.0',                    // your provider's own semver
  displayName: 'GitLab',
  category: 'code',
  availability: 'available',
  auth: { type: 'oauth2', scopes: ['read_api', 'read_repository'] },
  webhookEvents: ['push', 'merge_request'],
  capabilities: { ...NO_CAPABILITIES, oauth: true, webhooks: true, resourcePicker: true, healthCheck: true, byoa: true, fullSync: true, incrementalSync: true, manualSync: true, realtimeEvents: true, scheduledSync: true },
  iconKey: 'gitlab',
  brandColor: '#FC6D26',
  summary: 'Index repositories from GitLab groups and projects.',
};
```

A capability flag that is `true` MUST be backed by its interface — the contract
tests fail otherwise. Only claim what you implement.

## 3. Implement the capability interfaces

Implement only the capabilities you declared. The common ones:

- **`OAuthCapable`** — `buildConnectUrl(input, registration)` and
  `completeConnect(input, registration)`. Read app config/secrets from the
  `registration` (uniform keys: `app_client_id`, `app_client_secret`, …). Throw
  `ProviderAuthError` on anything unverifiable — never trust a bare id.
- **`WebhookCapable`** — `verifyWebhook` (timing-safe HMAC over raw bytes),
  `describeWebhook` (delivery id, event type, external account id;
  handshake→`challenge`), `normalizeWebhook` (payload → `PlatformEvent[]`).
- **`SyncCapable`** — `executeSync(ctx, sink)`: fetch content, push
  `KnowledgeItem`s to the sink. The `ConnectorEngine` owns batching, hash-skip,
  purge-before-reingest, and the summary; call `sink.flush()` before committing
  a cursor. Report per-scope failures via `sink.scopeFailed`.
- **`ResourceBrowsingCapable`** — `listResources(ctx)` powers the picker.
- **`HealthCapable`** — `checkHealth(ctx)` returns a platform health state.
- **`ByoaCapable`** — `describeByoaConfig()` (the enterprise form; secret fields
  are stored write-only) + `validateByoaConfig(values)`.
- **`CitationCapable`** / **`ToolCapable`** — optional (MCP-shaped tools).

All operations receive an `IntegrationContext` carrying `integration`, the
runtime `vault` handle, and the resolved `registration` (app creds).

## 4. Add the transport factory + deps

`deps.ts` exposes `transportFactory: (settings) => Transport`. The provider
resolves `settings` from the registration per call, so managed and BYOA "just
work." The composition roots pass the real factory
(`createXTransport`).

## 5. Contract tests (the acceptance gate)

Create `<id>.provider.test.ts`:

```ts
providerContractTests('gitlab', () => ({
  provider: createGitLabProvider({ transportFactory: () => new FakeGitLabTransport() }),
  fixtures: { integration: {...}, registration: fakeRegistration({ provider: 'gitlab' }), oauth: {...}, webhook: {...}, resources: { expectAtLeast: 1 } },
}));
```

The kit checks manifest validity, capability↔implementation consistency, OAuth
round-trip + misuse, webhook accept/tamper-reject + dedup stability,
normalization output, health mapping, and tool schemas. Add provider-specific
tests (signature vectors, normalization cases) alongside.

## 6. Register it

In **both** composition roots (`apps/platform-api/src/main.ts`,
`apps/worker/src/main.ts`):

```ts
providerRegistry.register(createGitLabProvider({ transportFactory: createGitLabTransport /*, sync: {...} in the worker */ }));
```

Remove its entry from `packages/providers/src/catalog/coming-soon.ts` if it was
listed. If it uses a new managed-app env var, add it to
`buildManagedRegistrations(env)` in both roots and to `packages/config/src/env.ts`.

## 7. Worker sync wiring (if `SyncCapable`)

Add a `ContentLedger` factory in `apps/worker/src/processors/content-ledgers.ts`
(over your detail table or the generic `sync_cursors`) and register it in the
worker's `ledgers` map. The generic `source-sync` processor handles the rest.

## 8. Frontend

Usually **nothing** — the marketplace renders from the manifest. Add an icon
mapping in `apps/web/src/pages/projects/IntegrationsPage.tsx` (`PROVIDER_ICONS`)
if you want a specific glyph.

## Checklist

- [ ] Module under `packages/providers/src/<id>/`, logic-only
- [ ] Manifest with honest capability flags
- [ ] Capability interfaces implemented
- [ ] `providerContractTests` passing + provider-specific tests
- [ ] Registered in both composition roots
- [ ] Managed env vars added to config + `buildManagedRegistrations` (if any)
- [ ] `ContentLedger` factory registered (if `SyncCapable`)
- [ ] Removed from the coming-soon catalog

---
[← Handbook](../README.md)
