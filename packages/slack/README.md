---
title: packages/slack
purpose: Dependency-free Slack Web API + OAuth client for connector ingestion.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-15
related:
  - ../../docs/backend/connectors.md
  - ../../docs/ai/rag-and-ingestion.md
---

# @meshify/slack

Slack integration used by the Connector Framework to ingest channel history as
conversation documents. No SDK dependency — plain `fetch` + `node:crypto`
(mirrors `@meshify/github`).

## Purpose & responsibilities
- OAuth: build the authorize URL and exchange the code for a bot token
  (`buildAuthorizeUrl`, `exchangeCodeForToken`), plus signed-state helpers
  (`signState`/`verifyState`) so the projectId survives Slack's static redirect.
- Read APIs behind the `SlackClient` port: `listChannels`, `fetchHistory`,
  `fetchReplies`, `getUserInfo`, `getPermalink` — paginated and `Retry-After`
  aware (`HttpSlackClient`), with an in-memory `FakeSlackClient` for tests.

## Public API
`SlackClient`, `HttpSlackClient`, `FakeSlackClient`, OAuth + state helpers, and
the message/channel/user types.

## Dependencies
None (uses `fetch` + `node:crypto`).

## Consumers
`apps/platform-api` (OAuth + channel listing use cases), `apps/worker` (Slack
ingest/sync processors).

## How to extend
Add Slack Web API calls to `SlackClient`/`HttpSlackClient` and mirror them in
`FakeSlackClient`. Keep credentials driven by `SLACK_CLIENT_ID`/
`SLACK_CLIENT_SECRET`/`SLACK_REDIRECT_URI`.

## How to test / debug
- Unit tests use `FakeSlackClient` (no network). Live use needs a Slack app with
  the bot scopes in `SLACK_BOT_SCOPES` and the redirect URI registered.

## Key files
`src/**`.

---
[← Handbook](../../docs/README.md)
