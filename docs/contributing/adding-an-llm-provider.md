# Adding an LLM Provider

Adding a new AI provider (Bedrock, Cohere, Mistral, xAI, DeepSeek, Vertex, a self-hosted server, …) is a
**manifest + adapter + one registration line**. No UI, RocketRide, database, or platform-api changes. This
mirrors the knowledge-source [adding-a-provider](./adding-a-provider.md) guide but for the AI subsystem.

## 1. Write the adapter

Create `packages/ai/src/providers/<vendor>/<vendor>.provider.ts` implementing `LlmProvider`:

```ts
export const ACME_MANIFEST: LlmProviderManifest = {
  id: 'acme',
  manifestVersion: AI_MANIFEST_VERSION,
  providerVersion: '1.0.0',
  displayName: 'Acme',
  summary: 'Acme foundation models.',
  iconKey: 'acme',
  brandColor: '#123456',
  auth: 'api_key',
  credentialFields: [{ key: 'api_key', label: 'API key', secret: true, placeholder: '...' }],
  modelSource: 'static',        // or 'dynamic' to fetch models live
  allowCustomModel: true,
};

export class AcmeProvider implements LlmProvider {
  readonly manifest = ACME_MANIFEST;
  constructor(deps?: LlmProviderDeps) { /* resolveDeps(deps) → http + now */ }
  defaultModels(): ModelInfo[] { /* static catalog, or [] for dynamic */ }
  validateCredentials(creds): void { requireSecret(creds, 'api_key', 'Acme API key'); }
  async testConnection(creds): Promise<TestConnectionResult> { /* live call; never throws */ }
  async listModels(creds): Promise<ModelInfo[]> { /* catalog or fetch */ }
  resolveRocketRideNode({ model, credentials }): ResolvedRocketRideNode {
    return { component: 'llm_openai_api', model, modelTotalTokens: /* ctx */, apikey: /* key */, baseUrl: /* endpoint */ };
  }
}
export function createAcmeProvider(deps?: LlmProviderDeps) { return new AcmeProvider(deps); }
```

Reuse the shared helpers in `providers/shared/`:
- `deps.ts` — `resolveDeps`, `requireSecret` / `requireConfig` / `optionalConfig`, `bearerHeaders`, `trimTrailingSlash`.
- `openai-compatible.ts` — `testOpenAiCompatible` / `listOpenAiCompatibleModels` for any OpenAI-shaped `GET /models`.
- `http.ts` — `mapHttpError` (status → typed error), `contextTokensFor`.

Pick a `component` from `RocketRideLlmComponent`. OpenAI-compatible vendors use `llm_openai_api` with a
`baseUrl`; native ones map to their own component. All secrets/config the adapter reads must be declared as
`credentialFields` (secrets go to the vault; non-secret fields land on the config row).

## 2. Register it

Add one line to `createBuiltInLlmRegistry` in `packages/ai/src/providers/index.ts`:

```ts
registry.register(createAcmeProvider(deps));
```

Export the factory/manifest from `packages/ai/src/index.ts`. That's it — the marketplace card, connect/test/
activate flow, model picker, and RocketRide resolution all read from the registry.

## 3. Add a brand icon (optional)

Add the vendor's `iconKey` → Simple Icons path in `apps/web/src/components/ProviderBrandIcon.tsx` (and a
color set entry). Unknown keys fall back to a generic glyph on a brand-colored chip.

## 4. Contract test

Add the provider to `packages/ai/src/providers/providers.contract.test.ts`:

```ts
llmProviderContractTests('acme', createAcmeProvider, {
  sampleCredentials: { secrets: { api_key: 'test' }, config: {} },
  sampleModel: 'acme-large',
  healthyModelsResponse: { body: { data: [{ id: 'acme-large' }] } },
  expectedComponent: 'llm_openai_api',
});
```

The contract kit asserts manifest validity, registry acceptance, credential validation, node resolution, and
that `testConnection` never throws (success + auth-failure). Run `pnpm --filter @meshify/ai test`.

## Checklist

- [ ] `<vendor>.provider.ts` implements `LlmProvider`, factory exported from `index.ts`.
- [ ] Registered in `createBuiltInLlmRegistry`.
- [ ] Brand icon (optional).
- [ ] `llmProviderContractTests` entry — green.
- [ ] No migration, no platform-api change, no RocketRide change.
