# Phase 3 — Architecture Review: Risks, Breaking Changes, Migration Notes

Self-review of the Phase 2 proposal before implementation. Ordered by severity.

---

## Risks & mitigations

**R1 — Pre-auth webhook endpoint is new attack surface (highest risk).**
Today every non-health route sits behind `authGuard`. The receivers must mount before it *and* before global `express.json()` (raw body needed for HMAC). Mitigations baked into the design: dedicated router with `express.raw` + strict size cap, timing-safe signature check as the very first operation, no DB/provider work before verification passes, unique `(provider, delivery_id)` insert as the only write, its own rate limiter (the per-key limiter can't apply), and never reflecting payload contents in responses. Residual risk: misordered middleware in a future refactor silently breaks signatures — covered by an e2e test asserting a tampered signature is rejected and that `express.json()` hasn't consumed the body.

**R2 — GitHub installation hijack via guessable `installation_id`.**
Installation ids are sequential integers and the Setup URL is public. If we bound any bare `installation_id` to the calling org, attacker A could claim victim B's installation. Design closes this: installations bind **only** through a single-use, org-bound `oauth_states` token issued by us; state-less callbacks are shown a "start from Meshify" screen. Trade-off accepted: a user who installed directly from the GitHub marketplace must click Connect once in Meshify (GitHub then round-trips instantly with state).

**R3 — Local development can't receive webhooks.**
github.com/slack.com can't reach `localhost:3000`. Consequences: webhook-driven sync is untestable locally without a tunnel. Mitigations: manual Sync buttons remain (same code path as webhook-enqueued syncs); docs describe an `smee.io`/`cloudflared` tunnel for full-loop dev; unit/e2e tests use recorded payloads with real signatures. This is standard for webhook products, but worth stating.

**R4 — Slack backfill fidelity.**
Lifting project-scoped workspaces to org-scoped integrations assumes `(org, team_id)` uniquely identifies an install. If two projects in one org connected the same workspace with different OAuth grants, we keep the most recent token — the older one may have channel memberships the newer lacks? No: Slack bot tokens are workspace-scoped, not channel-scoped (membership is bot-level), so any valid token for the team is equivalent. Real risk is a *revoked* newest token while an older row held a still-valid one; mitigation: post-backfill verification job calls `auth.test` per integration and flags failures as `error` status with a Reconnect prompt rather than silently breaking sync.

**R5 — Duplicate-vector amplification.**
Webhook-driven sync multiplies sync frequency, and repo re-ingest currently duplicates Qdrant points on retry/change (documented bug). The purge-before-reingest fix (M4) must land **with or before** webhook triggering, not after — sequenced accordingly. Dedupe keys cap concurrent queued syncs at one per repo/workspace.

**R6 — Token/credential migration correctness.**
The versioned envelope (`v1.`) must keep decrypting legacy `iv.tag.ct` ciphertexts (org API keys + Slack tokens). Covered by unit tests over real legacy fixtures and by not re-encrypting existing rows in-place (only new writes get `v1.`). `INTEGRATION_ENCRYPTION_KEY` defaults to the current key, so no operational change is forced.

**R7 — Managed-app secrets are still deployment env vars.**
The design intentionally keeps Meshify's *own* GitHub/Slack app credentials in env (set once by the operator) rather than in DB. This is the industry-standard shape (the platform owns its apps), but it means self-hosters still create two apps once per deployment. Customer-facing zero-setup is fully achieved; operator setup is documented, not eliminated. Flagging so expectations are explicit.

**R8 — Event-loss windows.**
Webhooks drop during deploys/outages (GitHub redelivers for 3 days via UI only; Slack retries ~3 times then gives up). The hourly staleness safety-net (M5) bounds the gap to ≤1h for active integrations plus manual Sync as an immediate escape hatch. Accepted trade-off vs running heavier reconciliation.

**R9 — SSE surface growth.**
A second org-scoped hub duplicates the JobEventHub pattern. Kept deliberately separate from the project job stream (different tenancy key, different consumers) rather than overloading `JobEvent` — slight code duplication, much lower regression risk to the proven jobs pipeline.

## Breaking changes

**None for existing users or API consumers** in M1–M6:
- All migrations additive; legacy Slack token column retained until a post-verification cleanup migration.
- `POST /projects/:id/repositories` keeps accepting `{source:'github', remoteUrl}`; picker payload is a new variant.
- Existing URL-connected repos keep syncing via the retained owner/repo→installation fallback.
- Env loosening (`GITHUB_APP_*` required→optional) only *removes* a boot failure mode. **Operational note:** deployments relying on boot-time validation to catch missing GitHub creds now find out via 503/worker warning instead.
- BFF untouched; web routes only added (`/oauth/slack/callback` kept as an alias of the generalized route until no in-flight OAuth can target it).

Deliberate behavior changes (features, not breaks): repo default-branch pushes now auto-sync (previously never synced without a click); Slack disconnect now calls `auth.revoke` (previously left tokens live — strictly better, but observable).

## Migration considerations

1. **Order**: schema (M1) → dual-read vault (M2/M3) → webhooks (M4). At every point old code paths still function.
2. **Backfill runs inside migration 0012's transaction**; `auth.test` verification runs async post-deploy (worker maintenance job) to avoid network calls inside a migration.
3. **`github_repo_id` backfills lazily** (one `GET /repos/{owner}/{repo}` per repo on next sync) — webhook resolution falls back to owner/name parsing until then, so push-sync works from day one even for legacy rows.
4. **Rollback**: revert deploy; new tables sit unused; the only irreversible step (legacy column drop) ships last, separately.
5. **k8s/compose**: no new services; one ingress path note (`/v1/integrations/webhooks/*` must not be stripped/buffered); webhook URL + app-setup runbook added to operations docs.

## Recommended improvements (bundled into the plan)

- Fix repo-sync stale-vector bug via purge-before-reingest (M4) — pre-existing correctness debt this feature would otherwise amplify.
- Deterministic `dedupe_key` on `pipeline_jobs` (M1) — also fixes today's double-click duplicate connects.
- Adopt `runPipelineJob` in the three older processors opportunistically when touched (M4), per the in-code TODO.
- Wire or delete dead config: both webhook secrets become live; dead `reindex`/`cleanup` job types and stale READMEs/comments cleaned in M8.
- First tests for the GitHub auth/client path (new code lands with tests; legacy client gains coverage as it's extended).
- `auth.revoke` on Slack disconnect; GitHub `DELETE /app/installations/{id}` on org-initiated disconnect (best-effort).

## Open decisions (defaults chosen; flag if you disagree)

| # | Decision | Default in design | Alternative |
|---|---|---|---|
| D1 | Integration scope | **Org-level** integrations, project-level resource selection (Vercel/Linear model; matches your multi-tenant spec) | Fully project-scoped (simpler mentally, but re-OAuth per project and contradicts "Organization A → Installation A") |
| D2 | Slack workspace tables | Keep `slack_workspaces` as per-project attachment; token moves to vault | Full re-normalization now (bigger migration, little gain) |
| D3 | Webhook receiver placement | platform-api (only public ingress today) | Separate `apps/webhooks` service (cleaner isolation, +1 deployable; easy to split later since receiver is a self-contained router) |
| D4 | Frontend home for integrations | New per-project **Integrations** page in workspace nav (+ Settings link) | Fold into Settings page (weaker discoverability; Settings is buried under "More") |
| D5 | GitHub user-OAuth for auto-detecting installations | Not in scope (state-bound flow suffices) | Add later for marketplace-first installs |

**Verdict: proceed.** Effort estimate: M1–M8 ≈ 35–45 focused commits. Highest-care areas: webhook router mounting/raw-body (R1), state-bound installation claiming (R2), backfill + dual-read (R4/R6).
