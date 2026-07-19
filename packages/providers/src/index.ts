// Base contracts
export type { ProviderDescriptor, ProviderCapabilities, ProviderCategory, ProviderAvailability } from './base/descriptor.js';
export { NO_CAPABILITIES } from './base/descriptor.js';
export type { Provider } from './base/provider.js';
export { supportsOAuth, supportsWebhooks, supportsSync, supportsHealthCheck, supportsResourceBrowsing, supportsCitations, supportsByoa } from './base/provider.js';
export type { VaultHandle, IntegrationContext, ConnectorContext } from './base/context.js';
export type { OAuthCapable, ConnectInput, CallbackInput, ConnectResult, CredentialInput, CredentialRefresh } from './base/oauth.js';
export type { WebhookCapable, RawWebhookRequest, WebhookDescriptor } from './base/webhook.js';
export type { SyncCapable, SyncContext, SyncMode, SyncSummary, CursorStore } from './base/sync.js';
export type { KnowledgeItem, KnowledgeSink } from './base/knowledge.js';
export type { HealthCapable, ProviderHealthReport } from './base/health.js';
export type { ResourceBrowsingCapable, ProviderResource, ResourcePage } from './base/resources.js';
export type { CitationCapable, CitationDetail } from './base/citation.js';
export type { ByoaCapable, ByoaConfigField } from './base/byoa.js';
export { ProviderNotFoundError, ProviderNotConfiguredError, ProviderAuthError, ProviderRateLimitError, ProviderConfigError } from './base/errors.js';

// Registry
export { ProviderRegistry, descriptorOnlyProvider } from './registry/provider-registry.js';

// Vault
export type { CredentialStore, SecretCipher, StoredCredential } from './vault/credential-store.port.js';
export { CredentialVault } from './vault/credential-vault.js';

// Events
export type { PlatformEvent, PlatformEventKind, StampedPlatformEvent, PlatformEventHandler, PlatformEventBus } from './events/platform-events.js';
export { RedisPlatformEventBus, PLATFORM_EVENTS_CHANNEL } from './events/redis-platform-event-bus.js';
export type { RedisPublisherConnection, RedisSubscriberConnection } from './events/redis-platform-event-bus.js';

// OAuth state
export { OAuthStateService, hashStateToken } from './oauth/state-service.js';
export type { OAuthStateStore, IssueStateInput } from './oauth/state-service.js';

// Providers
export { GitHubProvider, createGitHubProvider, GITHUB_DESCRIPTOR } from './github/github.provider.js';
export type { GitHubProviderDeps, GitHubAppSettings, GitHubAppTransport } from './github/deps.js';
export { createGitHubTransport } from './github/transport.js';
export { SlackProvider, createSlackProvider, SLACK_DESCRIPTOR } from './slack/slack.provider.js';
export type { SlackProviderDeps, SlackAppSettings, SlackTransport } from './slack/deps.js';
export { createSlackTransport } from './slack/transport.js';

// Catalog
export { COMING_SOON_PROVIDERS } from './catalog/coming-soon.js';
