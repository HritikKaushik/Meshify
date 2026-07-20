# AI Providers — Provider-Agnostic LLM Configuration

The AI Providers subsystem makes the chat/completion LLM a first-class, org-configurable
integration — connect multiple providers, store keys in the Credentials Vault, activate exactly one,
and have RocketRide use it automatically. It is a **separate subsystem, parallel to the knowledge-source
Integrations platform** ([provider-platform](../provider-platform/README.md)): the two share only the
Credentials Vault primitive and evolve independently.

> Knowledge-source providers answer *"where does knowledge come from?"*
> AI providers answer *"which model runs inference?"*

## Why separate from Integrations

The `@meshify/providers` registry and the `integrations` table model OAuth, webhooks, sync, project
attachment, and incremental ingestion — none of which apply to an LLM. Folding LLMs in would pollute that
architecture and force dishonest capability flags. Instead, AI providers get their own package
(`@meshify/ai`), their own registry, their own tables, and their own REST namespace, reusing only the
vault.

## Layers

```
Organization ── active provider ──► LLM Provider Configuration ──► (Credentials Vault: encrypted key)
                                             │
                        RocketRide  ◄──  LLM Resolution Service  ◄──  AI Provider Registry  ◄──  Adapter
```

- **`@meshify/ai`** — the domain package. `LlmProviderRegistry`, `LlmProvider` interface, `LlmProviderManifest`,
  and one adapter per vendor (OpenAI, Anthropic, Gemini, Azure OpenAI, OpenRouter, Ollama). Adapters receive
  **already-decrypted** credentials and never touch the DB or vault, so the package has **no dependency on
  `@meshify/providers`**. Each adapter implements `validateCredentials`, `testConnection`, `listModels`, and
  `resolveRocketRideNode`.
- **Persistence** (`@meshify/data-access`, migration `0016`): `llm_provider_configurations`
  (org-scoped metadata), `llm_provider_credentials` (the vault store — encrypted secrets), and
  `active_llm_providers` (`org_id` PK ⇒ exactly one active per org). Secrets are never duplicated in the
  metadata tables.
- **`platform-api` module** `modules/llm-providers` — the REST surface `/v1/providers/llm/*`, one use case per
  operation, the `LlmResolutionService` (with per-org cache), and the change notifier.

## RocketRide is vendor-blind

Every RocketRide LLM component (`llm_openai`, `llm_anthropic`, `llm_gemini`, `llm_openai_api`, `llm_ollama`)
shares the same `questions → answers` lane wiring, so swapping providers changes only a node's `provider` +
`config`, never the pipeline graph. The resolution flow:

1. Chat turn → `RocketRideChatPipelineResolver.resolve(project)`.
2. `LlmResolutionService.resolveForOrg(orgId)` → the active provider's adapter produces a
   `ResolvedRocketRideNode` (component + model + literal vault key + optional base URL).
3. The gateway's `llmNode` emits a RocketRide `custom` profile with those **literal** values (no `${ENV}`
   substitution), so the org's own key is injected directly.
4. **No active provider → the managed OpenAI/Gemini default**, byte-identical to the pre-BYOA behavior, so
   existing workflows keep working with zero configuration.

Switching providers invalidates the resolution cache **and** each of the org's cached chat pipelines, so the
next chat turn uses the new provider with no restart.

## Security

API keys never leave the backend, are encrypted at rest via the shared versioned AES-256-GCM vault, are never
serialized to any DTO or log (the detail endpoint reports only `configured: boolean` per secret field), and
rotation is a re-submit. Mutating routes pass through `canManageLLMProviders()` — the single RBAC seam
(returns `true` today; see [backend/ai-providers.md](../../backend/ai-providers.md)).

## Extending

Adding a provider = a manifest + an adapter + one line in `createBuiltInLlmRegistry`. No UI, RocketRide, or
migration changes. See [contributing/adding-an-llm-provider.md](../../contributing/adding-an-llm-provider.md).
Future providers (Bedrock, Cohere, Mistral, xAI, DeepSeek, Vertex, self-hosted) fit the same shape.
