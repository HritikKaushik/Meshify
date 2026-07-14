---
title: packages/shared
purpose: Cross-cutting utilities — the structured, credential-safe logger.
audience: All backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/backend/auth.md
---

# @meshify/shared

Small shared utilities used by every backend app. Currently: the logger.

## Purpose & responsibilities
- Provide `createLogger` (pino) with a consistent service tag and **credential redaction** (`authorization`, `cookie`, `set-cookie`).

## Public API
`createLogger(options)`, `Logger`, `LoggerOptions`.

## Dependencies
`pino`.

## Consumers
`apps/{platform-api,bff,worker,observability}`.

## How to extend
Add genuinely cross-cutting helpers here (not domain logic). Keep the surface small.

## How to test / debug
- Redaction is verifiable at runtime (see the security commit history / [Auth](../../docs/backend/auth.md)).
- `pino-http` in each app reuses this logger for request logging with correlation ids.

## Key files
`src/logger.ts`, `src/index.ts`.

---
[← Handbook](../../docs/README.md)
