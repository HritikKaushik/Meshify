---
title: packages/config
purpose: Load and zod-validate environment variables once, for every backend app.
audience: Backend engineers, operators.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/reference/environment-variables.md
---

# @meshify/config

The single source of truth for configuration. Fails fast on invalid/missing env.

## Purpose & responsibilities
- Parse `process.env` into a typed, validated `env` object (`loadEnv`).

## Public API
`loadEnv()` and the inferred `Env` type.

## Dependencies
`zod`.

## Consumers
`apps/{platform-api,bff,worker,observability}`, `@meshify/data-access`, `@meshify/rocketride-gateway`.

## How to extend
Add the variable to the zod schema in `src/env.ts` **and** to `.env.example` in
the same PR. See [Environment Variables](../../docs/reference/environment-variables.md).

## How to test / debug
- Never read `process.env` directly elsewhere — always go through `loadEnv()`.
- A bad value throws a descriptive zod error at boot naming the variable.

## Key files
`src/env.ts`, `src/index.ts`.

---
[← Handbook](../../docs/README.md)
