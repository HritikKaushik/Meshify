export type { Project, ProjectStatus } from './projects/project.entity.js';
export { embeddingDimensionFor, qdrantCollectionName, EMBEDDING_DIMENSIONS, llmProviderFromProfile, embeddingProviderFromProfile, apiKeyEnvVarFor } from './projects/project.entity.js';
export type { ProjectRepository, CreateProjectInput } from './projects/project.repository.js';
export { PostgresProjectRepository } from './projects/postgres-project.repository.js';

export type { Document, DocumentSourceType, DocumentStatus } from './documents/document.entity.js';
export { sourceTypeFromFilename } from './documents/document.entity.js';
export type { DocumentRepository, CreateDocumentInput } from './documents/document.repository.js';
export { PostgresDocumentRepository } from './documents/postgres-document.repository.js';

export type { KnowledgeConnector, ConnectorType, ConnectorStatus, SyncPolicy } from './connectors/knowledge-connector.entity.js';
export { SINGLETON_CONNECTOR_TYPES, defaultConnectorDisplayName } from './connectors/knowledge-connector.entity.js';
export type { KnowledgeConnectorRepository, CreateConnectorInput } from './connectors/knowledge-connector.repository.js';
export { PostgresKnowledgeConnectorRepository } from './connectors/postgres-knowledge-connector.repository.js';

export type { Integration, IntegrationMode, IntegrationStatus, IntegrationHealth, ProviderId } from './integrations/integration.entity.js';
export type { IntegrationRepository, CreateIntegrationInput } from './integrations/integration.repository.js';
export { PostgresIntegrationRepository } from './integrations/postgres-integration.repository.js';
export type { IntegrationCredential } from './integrations/integration-credential.entity.js';
export type { IntegrationCredentialRepository, UpsertIntegrationCredentialInput } from './integrations/integration-credential.repository.js';
export { PostgresIntegrationCredentialRepository } from './integrations/postgres-integration-credential.repository.js';
export type { OAuthState } from './integrations/oauth-state.entity.js';
export type { OAuthStateRepository, CreateOAuthStateInput } from './integrations/oauth-state.repository.js';
export { PostgresOAuthStateRepository } from './integrations/postgres-oauth-state.repository.js';
export type { WebhookEvent, WebhookEventStatus } from './integrations/webhook-event.entity.js';
export type { WebhookEventRepository, RecordWebhookEventInput } from './integrations/webhook-event.repository.js';
export { PostgresWebhookEventRepository } from './integrations/postgres-webhook-event.repository.js';
export type { SyncCursor } from './integrations/sync-cursor.entity.js';
export type { SyncCursorRepository } from './integrations/sync-cursor.repository.js';
export { PostgresSyncCursorRepository } from './integrations/postgres-sync-cursor.repository.js';

export type { SlackWorkspace } from './slack/slack-workspace.entity.js';
export type { SlackWorkspaceRepository, CreateSlackWorkspaceInput } from './slack/slack-workspace.repository.js';
export { PostgresSlackWorkspaceRepository } from './slack/postgres-slack-workspace.repository.js';
export type { SlackChannel } from './slack/slack-channel.entity.js';
export type { SlackChannelRepository, UpsertSlackChannelInput } from './slack/slack-channel.repository.js';
export { PostgresSlackChannelRepository } from './slack/postgres-slack-channel.repository.js';
export type { SlackConversation, SlackConversationStatus, SlackVisibility, SlackParticipant } from './slack/slack-conversation.entity.js';
export { SLACK_SOURCE_PREFIX, isSlackSourcePath, slackConversationKey, slackSourcePath } from './slack/slack-conversation.entity.js';
export type { SlackConversationRepository, UpsertSlackConversationInput } from './slack/slack-conversation.repository.js';
export { PostgresSlackConversationRepository } from './slack/postgres-slack-conversation.repository.js';
export type { SlackSyncState } from './slack/slack-sync-state.entity.js';
export type { SlackSyncStateRepository } from './slack/slack-sync-state.repository.js';
export { PostgresSlackSyncStateRepository } from './slack/postgres-slack-sync-state.repository.js';

export type { Repository, RepositorySource, RepositorySyncStatus } from './repositories/repository.entity.js';
export { parseGitHubUrl } from './repositories/repository.entity.js';
export type { RepositoryRepository, CreateRepositoryInput } from './repositories/repository.repository.js';
export { PostgresRepositoryRepository } from './repositories/postgres-repository.repository.js';

export type { RepoFile, FileStatus } from './files/file.entity.js';
export type { FileRepository, UpsertFileInput } from './files/file.repository.js';
export { PostgresFileRepository } from './files/postgres-file.repository.js';

export type { Chat, ChatSummary, Message, MessageRole, MessageCitation, SlackCitation } from './chats/chat.entity.js';
export type { ChatRepository, CreateChatInput, CreateMessageInput, UpdateChatInput } from './chats/chat.repository.js';
export { PostgresChatRepository } from './chats/postgres-chat.repository.js';

export type { PipelineJob, PipelineJobType, PipelineJobStatus } from './pipeline-jobs/pipeline-job.entity.js';
export { ACTIVE_JOB_STATUSES } from './pipeline-jobs/pipeline-job.entity.js';
export type { PipelineJobRepository, CreatePipelineJobInput } from './pipeline-jobs/pipeline-job.repository.js';
export { PostgresPipelineJobRepository } from './pipeline-jobs/postgres-pipeline-job.repository.js';

export type { PipelineRunSnapshot, PipelineRunTraceInput } from './pipeline-runs/pipeline-run.entity.js';
export { tokensToUsd } from './pipeline-runs/pipeline-run.entity.js';
export type { PipelineRunRepository } from './pipeline-runs/pipeline-run.repository.js';
export { PostgresPipelineRunRepository } from './pipeline-runs/postgres-pipeline-run.repository.js';

export type { ApiKey, AuthContext } from './api-keys/api-key.entity.js';
export { generateApiKey, hashApiKey, looksLikeApiKey, hashesEqual } from './api-keys/api-key.entity.js';
export type { ApiKeyRepository, ActiveApiKey, CreateApiKeyInput } from './api-keys/api-key.repository.js';
export { PostgresApiKeyRepository } from './api-keys/postgres-api-key.repository.js';

export type { AuditLogEntry } from './audit/audit-log.entity.js';
export type { AuditLogRepository } from './audit/audit-log.repository.js';
export { PostgresAuditLogRepository } from './audit/postgres-audit-log.repository.js';

export type { ClerkOrgLink } from './provisioning/clerk-org-link.entity.js';
export type { ClerkOrgLinkRepository, CreateClerkOrgLinkInput } from './provisioning/clerk-org-link.repository.js';
export { PostgresClerkOrgLinkRepository } from './provisioning/postgres-clerk-org-link.repository.js';
export { provisionOrgForClerk } from './provisioning/provision-org-for-clerk.js';
export type { ProvisionOrgForClerkInput } from './provisioning/provision-org-for-clerk.js';
export { encryptSecret, decryptSecret } from './provisioning/secret-encryption.js';
