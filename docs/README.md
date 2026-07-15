---
title: Meshify Engineering Handbook
purpose: The canonical navigation hub for all Meshify engineering documentation.
audience: All engineers, new hires, and AI assistants.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../README.md
  - ../TESTING.md
---

# Meshify Engineering Handbook

> The definitive source of truth for how Meshify is built, why it is built that
> way, and how to extend it. If a fact about the system belongs anywhere, it
> belongs here — linked to the code, never duplicating it.

**Meshify** is an AI-native engineering-knowledge platform: it indexes a team's
repositories and documents into per-project vector stores and answers questions
with cited, confidence-scored responses. It is a pnpm + Turborepo monorepo of
five applications and eleven shared packages.

## How to use this handbook

- **New to Meshify?** Read [Project Overview](architecture/overview.md) →
  [Getting Started](development/getting-started.md) →
  [Backend Architecture](architecture/backend.md) or
  [Frontend Architecture](architecture/frontend.md).
- **Adding a feature?** See [Contributing](contributing/index.md) and the
  relevant subsystem doc below.
- **On call / debugging?** See [Troubleshooting](operations/troubleshooting.md)
  and [Operations](operations/deployment.md).
- Every document carries frontmatter, cross-links, and references to real source
  files. Sections are kept small and predictably titled so a RAG system can
  retrieve them precisely.

## Map

### 1. Project Overview & Architecture
| Doc | What it answers |
| --- | --- |
| [System Overview](architecture/overview.md) | What Meshify is, its apps/packages, and how requests flow |
| [Backend Architecture](architecture/backend.md) | Clean-architecture layering, module anatomy, request lifecycle |
| [Frontend Architecture](architecture/frontend.md) | The web SPA, routing, code-splitting, data access |
| [Data Model](architecture/data-model.md) | Postgres tables, relationships, and the Qdrant collections |

### 2. AI & Retrieval
| Doc | What it answers |
| --- | --- |
| [RAG & Ingestion](ai/rag-and-ingestion.md) | How chat retrieval, document ingestion, repo ingestion, and RocketRide pipelines work |

### 3. Backend Subsystems
| Doc | What it answers |
| --- | --- |
| [Queues & Workers](backend/queues-and-workers.md) | BullMQ queues, worker processors, Redis, retries/DLQ |
| [Connector Framework](backend/connectors.md) | The generic knowledge-source model (GitHub, Documents, Slack) and how to add a source |
| [Authentication & Authorization](backend/auth.md) | Clerk → org API key → HMAC auth → project isolation |

### 4. Development
| Doc | What it answers |
| --- | --- |
| [Getting Started](development/getting-started.md) | Prerequisites, environment variables, running locally |
| [Testing](testing/index.md) | The testing architecture and how to write tests |
| [Contributing](contributing/index.md) | Conventions, how to add features, PR expectations |

### 5. Operations
| Doc | What it answers |
| --- | --- |
| [Deployment & CI/CD](operations/deployment.md) | How the system is built, shipped, and observed |
| [Troubleshooting](operations/troubleshooting.md) | Symptom → cause → fix for common failures |

### 6. Reference
| Doc | What it answers |
| --- | --- |
| [Environment Variables](reference/environment-variables.md) | Every env var, its owner app, and its source in code |
| [Glossary](reference/glossary.md) | Canonical terminology used across the codebase and docs |
| [FAQ](reference/faq.md) | Quick answers to recurring questions |

## Package & application ownership

Every app and package owns a README describing its purpose, public API,
dependencies, consumers, and how to extend/test/debug it:

- **Applications:** [`apps/web`](../apps/web/README.md) ·
  [`apps/bff`](../apps/bff/README.md) ·
  [`apps/platform-api`](../apps/platform-api/README.md) ·
  [`apps/worker`](../apps/worker/README.md) ·
  [`apps/observability`](../apps/observability/README.md)
- **Packages:** [`config`](../packages/config/README.md) ·
  [`shared`](../packages/shared/README.md) ·
  [`data-access`](../packages/data-access/README.md) ·
  [`vector-store`](../packages/vector-store/README.md) ·
  [`embeddings`](../packages/embeddings/README.md) ·
  [`queues`](../packages/queues/README.md) ·
  [`object-storage`](../packages/object-storage/README.md) ·
  [`github`](../packages/github/README.md) ·
  [`slack`](../packages/slack/README.md) ·
  [`rocketride-gateway`](../packages/rocketride-gateway/README.md) ·
  [`testing`](../packages/testing/README.md)

## Documentation standards

All docs follow [`_TEMPLATE.md`](_TEMPLATE.md): standardized frontmatter, then
**Overview → Architecture → Implementation → Best Practices → Common Mistakes →
Troubleshooting → Examples → References → Related → Next**. Diagrams are Mermaid.
Prefer linking to source over restating it — see
[Living Documentation](contributing/index.md#living-documentation).

---
_Maintained by the Platform Team. Found something stale? Fix it in the same PR
as the code change — see [Contributing](contributing/index.md)._
