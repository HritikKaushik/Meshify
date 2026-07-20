# Production Readiness Report — Provider Platform (M9)

_Milestone M9 — Production Hardening. Scope: the org-scoped, OAuth-managed provider platform (Organization → Provider Registration → Integration → Resources → Knowledge) on branch `feature/provider-platform`._

## Verdict

**Production readiness: 82%** — ready for a **controlled/limited-GA rollout** (managed GitHub + Slack, bounded org and repo/workspace counts, on-call coverage for the first sync waves). **Not yet ready for unbounded self-serve enterprise scale** without the three scalability items below. There are **no open security or multi-tenant blockers**; the remaining gap is throughput/operational maturity, not correctness.

The score is deliberately not higher: the platform is architecturally complete and the correctness-critical defects are closed, but two of the sweep/sync paths are serial fan-outs that have not been load-tested at enterprise cardinality, and there is no automated end-to-end test against live provider sandboxes yet. Those are the difference between "correct" and "proven at scale."

## What "blocker" means here

- **Blocker** = would cause data loss, a cross-tenant breach, silent corruption, or an unrecoverable stuck state in normal operation. **All known blockers are closed.**
- **Future enhancement** = improves scale, cost, latency, or operability, but the system is correct and recoverable without it.

## Scorecard

| Dimension | Score | Basis |
| --- | --- | --- |
| Architecture & correctness | 92% | Four-layer model resolves the OAuth circular dependency cleanly; provider-agnostic; no provider code outside provider modules; manifest-validated at boot. |
| Security | 88% | Encrypted-at-rest vault (AES-256-GCM versioned envelope); installation-ownership verification closes the cross-tenant claim; raw-body HMAC webhook verification; log redaction. Gaps: no secret-rotation runbook automation, no pen-test. |
| Multi-tenancy | 90% | Registration-scoped webhook resolution (no unscoped fallback); org-scoped queries throughout; per-org SSE. |
| Failure recovery | 85% | Enqueue compensation, orphan sweep, flush-barrier-before-cursor-commit, purge-before-reingest, per-resource sync_status. Gap: recovery paths are covered by unit tests, not chaos/fault-injection. |
| Scalability | 68% | Hot-path indexes added; N+1s collapsed. **Serial fan-out remains in health sweep and per-source sync**; webhook rate limiter is global-per-provider on the managed route. Not load-tested at enterprise cardinality. |
| Performance | 78% | Index coverage for the three cross-org sweeps; installation-token caching; ledger id memoization. Gap: large-repo tarball is buffered in memory. |
| Observability | 80% | Structured logs with secret redaction, domain event taxonomy, sync.completed/failed with context, per-org/per-project SSE. Gap: no metrics/tracing export (counts and latencies are in logs, not a dashboard). |
| Documentation | 95% | Full backend guides, adding-a-provider contributor guide, operations + disaster-recovery runbooks, env reference. |
| Test coverage | 80% | 135+ unit/integration tests green; migrations verified on throwaway Postgres. Gap: no automated E2E against provider sandboxes. |

## Blockers for production

**None open.** The following were found and fixed during M9 (committed in `ced7c97` and `a266356`):

1. **Cross-tenant webhook resolution** — the receiver could resolve a delivery against an unscoped candidate set. Now filters strictly by `registrationId` (managed → `null`), no fallback.
2. **GitHub installation cross-org claim** — a user could connect an installation they don't own. Now verified via user-authorization OAuth (`exchangeUserCode` → `listUserInstallationIds`) asserting the installation is accessible to the connecting user.
3. **Enqueue-failure data loss window** — a webhook recorded but failing to enqueue its sync could be silently dropped. Now compensated (`markFailed`) with an orphan-recovery sweep.
4. **Slack refresh-token ordering** — rotation could persist the access token before the refresh token, risking an unrenewable credential. Now ordered refresh-token-first.
5. **Reingest duplication** — purge now covers all target refs, not only ledger-known ones, so a reingest can't leave orphaned vectors.

## Future enhancements (not blockers)

Ranked by when they start to bite:

1. **Health sweep serial fan-out** (`sweepHealth`) — checks integrations one-by-one across all orgs. Fine at hundreds of integrations; batch/concurrency-bound it before thousands. _Scale trigger: ~1k active integrations._
2. **Per-source serial sync** — GitHub repos and Slack channels sync sequentially within one integration. Parallelize with a bounded pool for large installations. _Scale trigger: installations with hundreds of repos/channels._
3. **Webhook rate limiter is global-per-provider** on the managed route — a noisy managed tenant can consume the shared limit. Move to per-registration buckets. _Scale trigger: multiple high-volume managed orgs._
4. **Large-repo tarball buffered in memory** — switch to streaming extraction for very large repositories. _Scale trigger: repos beyond ~single-digit-GB._
5. **Metrics/tracing export** — promote the existing structured-log signals to a metrics backend + traces for SLO dashboards.
6. **Automated E2E against provider sandboxes** in CI — currently manual.
7. **GitHub-specific rename handling in the dispatcher** — localized, documented minor debt; fold into the canonical resource model when a third provider needs it.

## Rollout recommendation

1. Ship to a limited cohort with managed GitHub + Slack and per-org caps on repos/channels.
2. Watch `sync.failed` events and orphan-recovery counts through the first full sync waves.
3. Load-test the health sweep and per-source sync at target cardinality before removing the org cap.
4. Add per-registration webhook rate buckets and streaming tarball extraction before unbounded self-serve.

## Verification performed in M9

- `pnpm typecheck` — green across all 28 tasks.
- `pnpm test` — 135+ tests green across 21 packages.
- Migrations `0001`–`0015` applied in order on a throwaway Postgres 16; the three M9 indexes verified present.
