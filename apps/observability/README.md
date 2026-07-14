---
title: apps/observability
purpose: Consume RocketRide pipeline traces into Postgres for observability.
audience: Backend engineers, operators.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/operations/deployment.md
---

# @meshify/observability

Persists RocketRide pipeline run traces so AI executions are inspectable.

## Purpose & responsibilities
- Handle RocketRide DAP (pipeline) events and write `pipeline_runs` / `pipeline_run_traces`.

## Public API
Event handler (`src/dap-event-handler.ts`); no product HTTP surface.

## Dependencies
`@meshify/{config,shared,data-access,rocketride-gateway}`, `pg`.

## Consumers
Operators / dashboards querying `pipeline_runs*` tables.

## How to extend
Extend `src/dap-event-handler.ts` and the `pipeline-runs` repository in `data-access`.

## How to test
`pnpm --filter @meshify/observability test` (`src/dap-event-handler.test.ts`).

## How to debug
- Verify `ROCKETRIDE_*` connectivity and that traces land in `pipeline_run_traces`.

## Key files
`src/main.ts`, `src/dap-event-handler.ts`.

---
[← Handbook](../../docs/README.md)
