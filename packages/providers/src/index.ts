// Base contracts
export type { ProviderManifest, ProviderCapabilities, ProviderCategory, ProviderAvailability, ProviderAuthType } from './base/manifest.js';
export { NO_CAPABILITIES, CURRENT_MANIFEST_VERSION, SUPPORTED_MANIFEST_VERSIONS, validateManifest } from './base/manifest.js';
export type { Provider } from './base/provider.js';
export { supportsOAuth, supportsWebhooks, supportsSync, supportsHealthCheck, supportsResourceBrowsing, supportsCitations, supportsByoa, supportsTools } from './base/provider.js';
export type { VaultHandle, IntegrationContext, ConnectorContext, RegistrationContext } from './base/context.js';
export type { OAuthCapable, ConnectInput, CallbackInput, ConnectResult, CredentialInput, CredentialRefresh } from './base/oauth.js';
export type { WebhookCapable, RawWebhookRequest, WebhookDescriptor } from './base/webhook.js';
export type { SyncCapable, SyncContext, SyncMode, SyncSummary, CursorStore } from './base/sync.js';
export type { KnowledgeItem, KnowledgeSink } from './base/knowledge.js';
export type { HealthCapable, ProviderHealthReport } from './base/health.js';
export type { ResourceBrowsingCapable, ProviderResource, ResourcePage } from './base/resources.js';
export type { CitationCapable, CitationDetail } from './base/citation.js';
export type { ByoaCapable, ByoaConfigField } from './base/byoa.js';
export type { ToolCapable, ToolDefinition, ToolResult } from './base/tools.js';
export { ProviderNotFoundError, ProviderNotConfiguredError, ProviderAuthError, ProviderRateLimitError, ProviderConfigError } from './base/errors.js';

// Canonical resource model
export type { CanonicalAccount, CanonicalAccountKind, CanonicalWorkspace, CanonicalResource, SourceRefParts } from './base/canonical.js';
export { buildSourceRef, parseSourceRef } from './base/canonical.js';

// Registry
export { ProviderRegistry, manifestOnlyProvider } from './registry/provider-registry.js';
export { ProviderRegistrationService } from './registry/provider-registration-service.js';
export { buildManagedRegistrations } from './registry/managed-registrations.js';
export type { ManagedRegistrationEnv } from './registry/managed-registrations.js';
export { readString } from './base/config.js';
export type { ManagedRegistration, RegistrationStore } from './registry/provider-registration-service.js';

// Connector engine
export { ConnectorEngine } from './engine/connector-engine.js';
export type { KnowledgeWriter, ContentLedger, EngineProgress } from './engine/connector-engine.js';

// Vault
export type { CredentialStore, SecretCipher, StoredCredential } from './vault/credential-store.port.js';
export { CredentialVault } from './vault/credential-vault.js';

// Events
export type { PlatformEvent, PlatformEventKind, PlatformEventDomain, SyncReason, StampedPlatformEvent, PlatformEventHandler, PlatformEventBus } from './events/platform-events.js';
export { eventDomain } from './events/platform-events.js';
export { RedisPlatformEventBus, PLATFORM_EVENTS_CHANNEL } from './events/redis-platform-event-bus.js';
export type { RedisPublisherConnection, RedisSubscriberConnection } from './events/redis-platform-event-bus.js';

// OAuth state
export { OAuthStateService, hashStateToken } from './oauth/state-service.js';
export type { OAuthStateStore, IssueStateInput } from './oauth/state-service.js';

// Providers
export { GitHubProvider, createGitHubProvider, GITHUB_MANIFEST } from './github/github.provider.js';
export type { GitHubProviderDeps, GitHubAppSettings, GitHubAppTransport } from './github/deps.js';
export { createGitHubTransport } from './github/transport.js';
export { SlackProvider, createSlackProvider, SLACK_MANIFEST } from './slack/slack.provider.js';
export type { SlackProviderDeps, SlackAppSettings, SlackTransport } from './slack/deps.js';
export { createSlackTransport } from './slack/transport.js';

// Sync implementations + shared source utilities
export { executeGitHubSync } from './github/sync.js';
export type { GitHubSyncDeps, GitHubRepoTransport } from './github/sync.js';
export { executeSlackSync } from './slack/sync.js';
export type { SlackSyncDeps } from './slack/sync.js';
export { scanExtractedRepo, detectLanguage, hashContent, isBinaryBuffer, isDeniedPath } from './github/archive/repo-scanner.js';
export type { ScannedFile } from './github/archive/repo-scanner.js';
export { withExtractedArchive } from './github/archive/archive-extractor.js';
export { groupConversations } from './slack/conversation-grouper.js';

// Catalog
export { COMING_SOON_PROVIDERS } from './catalog/coming-soon.js';
