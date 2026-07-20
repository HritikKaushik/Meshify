---
title: Webhook Guide
purpose: How inbound provider webhooks are received, verified, and dispatched into platform events and syncs.
audience: Backend engineers, on-call.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - provider-platform.md
  - queues-and-workers.md
---

# Webhook Guide

> Receive fast, process durably. The receiver verifies + records + enqueues in
> milliseconds; the worker normalizes the delivery into provider-independent
> platform events and dispatches syncs. Redelivery is idempotent by construction.

## Receiver (`apps/platform-api`)

The **only unauthenticated mutating surface**, mounted **before** the global
`express.json()` and `authGuard` so signatures verify over the exact raw bytes.

```
POST /v1/integrations/webhooks/:provider                 # managed app (deployment secret)
POST /v1/integrations/webhooks/:provider/:registrationId # BYOA app (that registration's secret)
```

Receipt discipline (`webhooks.controller.ts`):

1. Per-provider fixed-window **rate limit** (pre-auth; the per-key limiter can't apply).
2. Resolve the **verification secret** via the registration layer — managed
   route → the deployment's managed registration; per-registration route →
   `resolveById(registrationId)`. Unresolvable secret → `404` (indistinguishable
   from an unknown endpoint; never confirms which registrations exist).
3. `verifyWebhook(raw, secret)` — **timing-safe HMAC over raw bytes**. Slack
   also enforces a ±5-min timestamp window (replay protection).
4. `describeWebhook` — a `challenge` (Slack `url_verification`) is echoed inline;
   an `ignore` is ACKed; otherwise it's an `event`.
5. Resolve the **integration** from the payload's external account id
   (installation id / team id), scoped to the registration for the BYOA route.
6. `recordIfNew` — unique `(provider, delivery_id)`; a **redelivery is an
   idempotent no-op** (`200 { duplicate: true }`).
7. Enqueue `webhook-events` job, mark the row `queued`, ACK `200`.

Verified-but-unclaimed deliveries (e.g. an installation not yet connected in
Meshify) are kept as `skipped` for audit — never dropped silently.

## Dispatcher (`apps/worker`)

`webhook-event.processor.ts` runs the dispatch **inside the BullMQ job**
(durable, retried) — a crash between receipt and dispatch can never lose a sync
trigger:

1. Load the recorded event; skip if already `processed`/`skipped`.
2. Resolve the integration + its registration; `normalizeWebhook` → `PlatformEvent[]`.
3. For each event, **dispatch** (schedule syncs / flip status+health) then
   **publish** to the event bus (feeds the org SSE stream).
4. Mark `processed`.

### Event-domain → action mapping

| Platform event | Action |
| --- | --- |
| `resource.updated` | immediate dedupe-keyed incremental sync of the connectors bound to that resource |
| `content.changed` | debounced (45 s) coalesced incremental sync (bursts collapse via the dedupe key) |
| `resource.removed` | soft-remove from the inventory; flag bound connectors `error` |
| `resource.renamed` | update inventory; rename repo identity (owner/name/url) |
| `permission.changed` | soft-remove revoked resources; flag their connectors |
| `connection.revoked` / `.suspended` | integration status/health flip + connector fan-out |
| `health.changed` | update integration health |

Reprocessing a delivery is safe: sync enqueues are dedupe-keyed and status flips
are idempotent.

## Development

Providers can't reach `localhost`. For a full loop, tunnel the receiver
(`smee.io`, `cloudflared`, `ngrok`) to `/v1/integrations/webhooks/*` and set the
tunnel URL as the app's webhook URL. Manual **Sync now** uses the same sync code
path, so most development needs no tunnel.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401` on delivery | signature mismatch (wrong secret, body reshaped) | confirm the app's webhook secret matches the registration; ensure no proxy rewrites the body |
| `404` on delivery | unknown provider or unresolved secret | check the URL and that the managed env / BYOA registration is set |
| Delivery `skipped` | no integration claims the account id | connect the installation/workspace in Meshify first |
| No sync after push | not the default branch, or debounce window | GitHub only syncs default-branch pushes; content.changed waits 45 s |

---
[← Handbook](../README.md)
