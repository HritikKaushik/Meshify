# AI Providers — Backend Runtime

Runtime reference for the LLM configuration subsystem. Architecture: see
[architecture/ai-providers](../architecture/ai-providers/README.md).

## Packages & modules

| Location | Responsibility |
| --- | --- |
| `packages/ai` (`@meshify/ai`) | `LlmProviderRegistry`, `LlmProvider`/`LlmCapable` contracts, `LlmProviderManifest`, 6 adapters, `createBuiltInLlmRegistry`, contract-test kit (`@meshify/ai/testing`). |
| `packages/data-access/src/llm-providers` | `llm_provider_configurations`, `active_llm_providers` entities/repos, and the bare `PostgresLlmProviderCredentialRepository` (vault store). Migration `0016_llm_providers.sql`. |
| `apps/platform-api/src/modules/llm-providers` | REST controller, use cases, `LlmResolutionService`, `InProcessLlmProviderChangeNotifier`, `canManageLLMProviders` (RBAC seam). |
| `packages/rocketride-gateway` | `ResolvedLlmConfig` + `llmNode` resolved path (custom-profile injection). |

## REST API (`/v1/providers/llm`)

All routes are org-scoped via `req.auth.orgId`. Read routes are open to any authenticated org member;
mutating routes pass `requireLlmAdmin`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/providers/llm` | Catalog: every provider + this org's status/active. |
| GET | `/v1/providers/llm/:provider` | Detail: masked credential fields, models, config. |
| GET | `/v1/providers/llm/:provider/models` | Models (static catalog or live fetch). |
| POST | `/v1/providers/llm/:provider/connect` | Save credentials + config `{ values, defaultModel? }`. |
| POST | `/v1/providers/llm/:provider/test` | Live test `{ values?, model? }` → `{ ok, models, latencyMs, region?, error? }`. |
| POST | `/v1/providers/llm/:provider/activate` | Make this the org's single active provider. |
| DELETE | `/v1/providers/llm/:provider` | Disconnect (purge credentials + config). |

The BFF is a generic `/api/v1/*` proxy, so no BFF change is needed. The web client methods live in
`apps/web/src/api.ts` (`listLlmProviders`, `getLlmProvider`, `connectLlmProvider`, `testLlmProvider`,
`activateLlmProvider`, `disconnectLlmProvider`, `listLlmModels`).

## Credentials & the vault

Secrets (e.g. `api_key`) are stored via a `CredentialVault` over `PostgresLlmProviderCredentialRepository`,
keyed by the configuration id, using the same cipher as the Integrations platform
(`INTEGRATION_ENCRYPTION_KEY` ?? `ORG_KEY_ENCRYPTION_KEY`). Non-secret config (Azure endpoint/version/
deployment, OpenRouter base URL, Ollama server URL) lives on the configuration row's `config` jsonb. The
detail endpoint reports secrets only as `configured: boolean` — values are never echoed.

## Resolution & cache invalidation

`LlmResolutionService.resolveForOrg(orgId)` joins `active_llm_providers` → configuration, decrypts creds via
the vault, and calls the adapter's `resolveRocketRideNode`, returning a `ResolvedLlmConfig` (or `null` → the
managed fallback). Results are cached per org. On connect/activate/disconnect, `InProcessLlmProviderChangeNotifier`
invalidates the org's resolution cache **and** every one of the org's cached chat pipeline tokens
(`ProjectRepository.findByOrgId` → `ChatPipelineResolver.invalidate`), so the next chat turn rebuilds against
the new provider — no restart.

> Multi-instance note: the resolution cache and the chat pipeline token cache are in-process (same as the
> existing per-project profile-switch behavior). Other platform-api instances pick up a provider change on
> their next cache miss / restart. If strict cross-instance immediacy is needed later, publish a provider-change
> platform event and subscribe the caches to it.

## Provider → RocketRide component mapping

| Provider | Component | Notes |
| --- | --- | --- |
| OpenAI | `llm_openai` | `apikey`, `model`, `modelTotalTokens`. |
| Anthropic | `llm_anthropic` | same fields. |
| Gemini | `llm_gemini` | adds `outputTokens`. |
| OpenRouter | `llm_openai_api` | `base_url` = `https://openrouter.ai/api/v1` (overridable). |
| Azure OpenAI | `llm_openai_api` | `base_url` = `{endpoint}/openai/deployments/{deployment}`, `model` = deployment. **Best-effort**: the generic node does not add Azure's `api-version` query param — verify execution against your RocketRide deployment. Credential validation / `testConnection` use correct Azure auth and are exact. |
| Ollama | `llm_ollama` | keyless; `serverbase` = `{server_url}/v1`, plus `temperature` / `reasoning_effort`. |

## Error handling

Adapters map vendor failures to typed `LlmProviderError` subclasses (auth, rate-limit, quota, unavailable,
unsupported-model, timeout, config). The controller's `mapError` translates these to actionable HTTP codes.
`testConnection` never throws — failures return `{ ok: false, error, errorCode }`.

## Permissions (RBAC seam)

`apps/platform-api/src/modules/llm-providers/authorization/llm-authorization.ts` exports
`canManageLLMProviders(auth)` — the single gate for all mutations. It returns `true` today (platform-api has
no role concept; the BFF resolves a Clerk session to one org key = full org access). When RBAC lands,
implement it as e.g. `auth.scopes.includes('llm:admin')` or a Clerk org-role check — nothing else changes.

## Environment

No new required variables. Secrets reuse `INTEGRATION_ENCRYPTION_KEY` (or `ORG_KEY_ENCRYPTION_KEY`). The
managed fallback reuses the existing `ROCKETRIDE_OPENAI_KEY` / `ROCKETRIDE_GEMINI_KEY`.
