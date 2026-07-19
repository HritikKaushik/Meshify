# @meshify/providers

The provider platform core: every knowledge source (GitHub, Slack, and each
future provider) is an implementation of the contracts in `src/base/`,
registered in a `ProviderRegistry` and resolved only through it — no provider
conditionals exist anywhere else in the codebase.

## Layout

| Path | What lives there |
| --- | --- |
| `src/base/` | The contracts: `Provider` + capability interfaces (`OAuthCapable`, `WebhookCapable`, `SyncCapable`, `HealthCapable`, `ResourceBrowsingCapable`, `CitationCapable`, `ByoaCapable`), descriptor/capabilities, typed errors, `KnowledgeItem`/`KnowledgeSink` (the normalization boundary — the AI layer consumes only what passed through a sink) |
| `src/registry/` | `ProviderRegistry` — registration + resolution; descriptor-only "coming soon" entries |
| `src/vault/` | `CredentialVault` over the `CredentialStore`/`SecretCipher` ports — the only reader/writer of integration credentials (Postgres+AES-GCM today; KMS/Vault backends slot in behind the port) |
| `src/events/` | `PlatformEvent` vocabulary + `PlatformEventBus` port and its Redis Pub/Sub implementation — consumers subscribe to events, never to providers |
| `src/oauth/` | `OAuthStateService` — server-side, single-use, org-bound connect state |
| `src/github/`, `src/slack/` | The two shipped providers (logic only; HTTP transports stay in `@meshify/github` / `@meshify/slack`) |
| `src/catalog/` | Descriptor-only marketplace entries for roadmap providers |
| `src/testing/` | Fakes + `providerContractTests` — the reusable acceptance gate every provider must pass |

## Adding a provider

1. Implement `Provider` + the capability interfaces the source supports, with a
   transport port so it is testable with fakes.
2. Declare exactly those capabilities in the descriptor (the contract tests
   fail on any mismatch, in both directions).
3. Run `providerContractTests('<id>', …)` from the provider's test file and add
   provider-specific tests (signature vectors, normalization cases).
4. Register it in the composition roots (`register(createXProvider(deps))`) and
   replace its coming-soon catalog entry.

See `docs/contributing/adding-a-provider.md` (landing with the docs milestone)
and `docs/architecture/provider-platform/README.md` for the full design.
