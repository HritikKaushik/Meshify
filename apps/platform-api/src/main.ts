import '@meshify/telemetry'; // MUST be first — instruments http/express/pg before they load
import express from 'express';
import { pinoHttp } from 'pino-http';
import pg from 'pg';
import { Redis } from 'ioredis';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import { PostgresChecker } from './modules/health/infrastructure/postgres.checker.js';
import { RedisChecker } from './modules/health/infrastructure/redis.checker.js';
import { QdrantChecker } from './modules/health/infrastructure/qdrant.checker.js';
import { CheckHealthUseCase } from './modules/health/application/check-health.usecase.js';
import { createHealthController } from './modules/health/interface/health.controller.js';
import { createMetrics } from './modules/observability/metrics.js';
import { PostgresProjectRepository } from '@meshify/data-access';
import { QdrantCollectionProvisioner } from '@meshify/vector-store';
import { CreateProjectUseCase } from './modules/projects/application/create-project.usecase.js';
import { DeleteProjectUseCase } from './modules/projects/application/delete-project.usecase.js';
import { GetProjectUseCase } from './modules/projects/application/get-project.usecase.js';
import { GetProjectStatsUseCase } from './modules/projects/application/get-project-stats.usecase.js';
import { ListProjectsUseCase } from './modules/projects/application/list-projects.usecase.js';
import { createProjectsController } from './modules/projects/interface/projects.controller.js';
import { PostgresDocumentRepository, PostgresPipelineJobRepository } from '@meshify/data-access';
import { ObjectStorageClient } from '@meshify/object-storage';
import { createDocumentIngestQueue } from '@meshify/queues';
import { UploadDocumentUseCase } from './modules/documents/application/upload-document.usecase.js';
import { ListDocumentsUseCase } from './modules/documents/application/list-documents.usecase.js';
import { DeleteDocumentUseCase } from './modules/documents/application/delete-document.usecase.js';
import { GetDocumentContentUseCase } from './modules/documents/application/get-document-content.usecase.js';
import { createDocumentsController } from './modules/documents/interface/documents.controller.js';
import { GetJobStatusUseCase } from './modules/jobs/application/get-job-status.usecase.js';
import { ListProjectJobsUseCase } from './modules/jobs/application/list-project-jobs.usecase.js';
import { JobEventHub } from './modules/jobs/infrastructure/job-event-hub.js';
import { createJobsController } from './modules/jobs/interface/jobs.controller.js';
import { JobEventSubscriber } from '@meshify/queues';
import { PostgresRepositoryRepository, PostgresFileRepository } from '@meshify/data-access';
import { createRepoIngestQueue, createRepoSyncQueue, createSourceSyncQueue, createWebhookEventsQueue } from '@meshify/queues';
import { ConnectGitHubRepositoryUseCase } from './modules/repositories/application/connect-github-repository.usecase.js';
import { UploadRepositoryZipUseCase } from './modules/repositories/application/upload-repository-zip.usecase.js';
import { SyncRepositoryUseCase } from './modules/repositories/application/sync-repository.usecase.js';
import { ListRepositoriesUseCase } from './modules/repositories/application/list-repositories.usecase.js';
import { DeleteRepositoryUseCase } from './modules/repositories/application/delete-repository.usecase.js';
import { createRepositoriesController } from './modules/repositories/interface/repositories.controller.js';
import {
	PostgresKnowledgeConnectorRepository,
	PostgresSlackWorkspaceRepository,
	PostgresSlackChannelRepository,
	PostgresSlackConversationRepository,
} from '@meshify/data-access';
import { createSlackIngestQueue, createSlackSyncQueue } from '@meshify/queues';
import { HttpSlackClient } from '@meshify/slack';
import { ListConnectorsUseCase } from './modules/connectors/application/list-connectors.usecase.js';
import { DeleteConnectorUseCase } from './modules/connectors/application/delete-connector.usecase.js';
import { createConnectorsController } from './modules/connectors/interface/connectors.controller.js';
import { StartSlackOAuthUseCase } from './modules/slack/application/start-slack-oauth.usecase.js';
import { CompleteSlackOAuthUseCase } from './modules/slack/application/complete-slack-oauth.usecase.js';
import { ListSlackChannelsUseCase } from './modules/slack/application/list-slack-channels.usecase.js';
import { SelectSlackChannelsUseCase } from './modules/slack/application/select-slack-channels.usecase.js';
import { SyncSlackUseCase } from './modules/slack/application/sync-slack.usecase.js';
import { createSlackController } from './modules/slack/interface/slack.controller.js';
import { PostgresChatRepository } from '@meshify/data-access';
import { PipelineRegistry, RocketRideClientPool, RocketRideRagService } from '@meshify/rocketride-gateway';
import { RocketRideChatPipelineResolver } from './modules/chat/infrastructure/rocketride-chat-pipeline.resolver.js';
import { VectorSearchContextRetriever } from './modules/chat/infrastructure/vector-search-context-retriever.js';
import { SlackCitationEnricher } from './modules/chat/infrastructure/slack-citation-enricher.js';
import { AskQuestionUseCase } from './modules/chat/application/ask-question.usecase.js';
import { ListConversationsUseCase } from './modules/chat/application/list-conversations.usecase.js';
import { UpdateConversationUseCase } from './modules/chat/application/update-conversation.usecase.js';
import { DeleteConversationUseCase } from './modules/chat/application/delete-conversation.usecase.js';
import { GetConversationMessagesUseCase } from './modules/chat/application/get-conversation-messages.usecase.js';
import { createChatController } from './modules/chat/interface/chat.controller.js';
import { QdrantSearchClient } from '@meshify/vector-store';
import { ConfiguredEmbeddingProviderFactory } from './modules/retrieval/infrastructure/embedding-provider.factory.js';
import { PostgresApiKeyRepository, PostgresAuditLogRepository } from '@meshify/data-access';
import { AuthenticateApiKeyUseCase } from './modules/security/application/authenticate.usecase.js';
import { authGuard } from './modules/security/interface/auth.guard.js';
import { RedisRateLimiter } from './modules/security/infrastructure/redis-rate-limiter.js';
import { InMemoryRateLimiter } from './modules/security/infrastructure/in-memory-rate-limiter.js';
import { FallbackRateLimiter } from './modules/security/infrastructure/fallback-rate-limiter.js';
import { rateLimitGuard } from './modules/security/interface/rate-limit.guard.js';
import { auditLogMiddleware } from './modules/security/interface/audit-log.middleware.js';
import {
	PostgresIntegrationRepository,
	PostgresIntegrationCredentialRepository,
	PostgresIntegrationResourceRepository,
	PostgresOAuthStateRepository,
	PostgresWebhookEventRepository,
	PostgresProviderRegistrationRepository,
	PostgresProviderRegistrationCredentialRepository,
	PostgresLlmProviderConfigurationRepository,
	PostgresActiveLlmProviderRepository,
	PostgresLlmProviderCredentialRepository,
	encryptSecret,
	decryptSecret,
} from '@meshify/data-access';
import { createBuiltInLlmRegistry } from '@meshify/ai';
import { ListLlmProvidersUseCase } from './modules/llm-providers/application/list-llm-providers.usecase.js';
import { GetLlmProviderUseCase } from './modules/llm-providers/application/get-llm-provider.usecase.js';
import { ConnectLlmProviderUseCase } from './modules/llm-providers/application/connect-llm-provider.usecase.js';
import { TestLlmProviderUseCase } from './modules/llm-providers/application/test-llm-provider.usecase.js';
import { ActivateLlmProviderUseCase } from './modules/llm-providers/application/activate-llm-provider.usecase.js';
import { DisconnectLlmProviderUseCase } from './modules/llm-providers/application/disconnect-llm-provider.usecase.js';
import { ListLlmModelsUseCase } from './modules/llm-providers/application/list-llm-models.usecase.js';
import { LlmResolutionService } from './modules/llm-providers/infrastructure/llm-resolution.service.js';
import { InProcessLlmProviderChangeNotifier } from './modules/llm-providers/infrastructure/in-process-llm-provider-change-notifier.js';
import { createLlmProvidersController } from './modules/llm-providers/interface/llm-providers.controller.js';
import {
	COMING_SOON_PROVIDERS,
	CredentialVault,
	OAuthStateService,
	ProviderNotConfiguredError,
	ProviderRegistry,
	ProviderRegistrationService,
	RedisPlatformEventBus,
	buildManagedRegistrations,
	createGitHubProvider,
	createGitHubTransport,
	createSlackProvider,
	createSlackTransport,
} from '@meshify/providers';
import { ListProvidersUseCase } from './modules/integrations/application/list-providers.usecase.js';
import { ListIntegrationsUseCase } from './modules/integrations/application/list-integrations.usecase.js';
import { ConnectProviderUseCase } from './modules/integrations/application/connect-provider.usecase.js';
import { CompleteConnectUseCase } from './modules/integrations/application/complete-connect.usecase.js';
import { ReconnectIntegrationUseCase } from './modules/integrations/application/reconnect-integration.usecase.js';
import { DisconnectIntegrationUseCase } from './modules/integrations/application/disconnect-integration.usecase.js';
import { ListIntegrationResourcesUseCase } from './modules/integrations/application/list-integration-resources.usecase.js';
import { ConfigureRegistrationUseCase, DescribeRegistrationUseCase, DeleteRegistrationUseCase } from './modules/integrations/application/configure-registration.usecase.js';
import { IntegrationEventHub } from './modules/integrations/infrastructure/integration-event-hub.js';
import { createIntegrationsController } from './modules/integrations/interface/integrations.controller.js';
import { createWebhooksController } from './modules/integrations/interface/webhooks.controller.js';
import { AttachSlackWorkspaceUseCase } from './modules/slack/application/attach-slack-workspace.usecase.js';
import { ConnectRepositoryFromIntegrationUseCase } from './modules/repositories/application/connect-repository-from-integration.usecase.js';



async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'platform-api' });

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
	await redis.connect();

	// BullMQ requires its own connection with maxRetriesPerRequest: null — cannot share the health-check client above.
	const bullRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

	const checkHealth = new CheckHealthUseCase([
		new PostgresChecker(pgPool),
		new RedisChecker(redis),
		new QdrantChecker(env.QDRANT_URL, env.QDRANT_API_KEY),
	]);

	const projectRepository = new PostgresProjectRepository(pgPool);
	const qdrantProvisioner = new QdrantCollectionProvisioner(env.QDRANT_URL, env.QDRANT_API_KEY);
	const createProject = new CreateProjectUseCase(projectRepository, qdrantProvisioner);
	const deleteProject = new DeleteProjectUseCase(projectRepository, qdrantProvisioner);
	const getProject = new GetProjectUseCase(projectRepository);
	const listProjects = new ListProjectsUseCase(projectRepository);

	const knowledgeConnectorRepository = new PostgresKnowledgeConnectorRepository(pgPool);
	const documentRepository = new PostgresDocumentRepository(pgPool);
	const pipelineJobRepository = new PostgresPipelineJobRepository(pgPool);
	const objectStorage = new ObjectStorageClient({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		bucket: env.S3_BUCKET,
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
	});
	const ingestQueue = createDocumentIngestQueue(bullRedis);
	const uploadDocument = new UploadDocumentUseCase(knowledgeConnectorRepository, documentRepository, pipelineJobRepository, objectStorage, ingestQueue);
	const listDocuments = new ListDocumentsUseCase(documentRepository);
	const getDocumentContent = new GetDocumentContentUseCase(documentRepository, objectStorage);
		const getJobStatus = new GetJobStatusUseCase(pipelineJobRepository);
	const listProjectJobs = new ListProjectJobsUseCase(pipelineJobRepository);
	// Real-time job progress: a DEDICATED Redis connection (subscribe mode can't run other commands)
	// feeds the in-process hub that fans events out to per-project SSE connections.
	const jobEventsRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
	const jobEventHub = new JobEventHub(new JobEventSubscriber(jobEventsRedis));
	await jobEventHub.start();

	const repositoryRepository = new PostgresRepositoryRepository(pgPool);
		const fileRepository = new PostgresFileRepository(pgPool);
	const repoIngestQueue = createRepoIngestQueue(bullRedis);
	const repoSyncQueue = createRepoSyncQueue(bullRedis);
	const sourceSyncQueue = createSourceSyncQueue(bullRedis);
	const connectGitHub = new ConnectGitHubRepositoryUseCase(knowledgeConnectorRepository, repositoryRepository, pipelineJobRepository, repoIngestQueue);
	const uploadZip = new UploadRepositoryZipUseCase(knowledgeConnectorRepository, repositoryRepository, pipelineJobRepository, objectStorage, repoIngestQueue);
	const syncRepository = new SyncRepositoryUseCase(repositoryRepository, knowledgeConnectorRepository, pipelineJobRepository, repoSyncQueue, sourceSyncQueue);
	const listRepositories = new ListRepositoriesUseCase(repositoryRepository);

	const qdrantSearchClient = new QdrantSearchClient(env.QDRANT_URL, env.QDRANT_API_KEY);
	const embeddingProviderFactory = new ConfiguredEmbeddingProviderFactory(env.ROCKETRIDE_OPENAI_KEY);

		// Document teardown reuses the same object-storage + Qdrant clients as ingest/search.
		const deleteDocument = new DeleteDocumentUseCase(documentRepository, objectStorage, qdrantSearchClient, (ctx, msg) => logger.error(ctx, msg));
		const deleteRepository = new DeleteRepositoryUseCase(repositoryRepository, fileRepository, objectStorage, qdrantSearchClient, knowledgeConnectorRepository, (ctx, msg) => logger.error(ctx, msg));

	// --- Generic Connector Framework (unified list + Slack, the first new source) ---
	const slackWorkspaceRepository = new PostgresSlackWorkspaceRepository(pgPool);
	const slackChannelRepository = new PostgresSlackChannelRepository(pgPool);
	const slackConversationRepository = new PostgresSlackConversationRepository(pgPool);
	const slackIngestQueue = createSlackIngestQueue(bullRedis);
	const slackSyncQueue = createSlackSyncQueue(bullRedis);
	const slackClient = new HttpSlackClient();
	// OAuth `state` signing + access-token encryption reuse ORG_KEY_ENCRYPTION_KEY; the Slack use cases validate presence at runtime.
	const slackRuntimeConfig = {
		clientId: env.SLACK_CLIENT_ID,
		clientSecret: env.SLACK_CLIENT_SECRET,
		redirectUri: env.SLACK_REDIRECT_URI,
		secret: env.ORG_KEY_ENCRYPTION_KEY,
	};

	const listConnectors = new ListConnectorsUseCase(
		knowledgeConnectorRepository,
		repositoryRepository,
		documentRepository,
		slackWorkspaceRepository,
		slackChannelRepository,
		slackConversationRepository
	);
	const deleteConnector = new DeleteConnectorUseCase(
		knowledgeConnectorRepository,
		repositoryRepository,
		fileRepository,
		documentRepository,
		slackWorkspaceRepository,
		slackConversationRepository,
		qdrantSearchClient,
		objectStorage,
		(ctx, msg) => logger.error(ctx, msg)
	);

	const startSlackOAuth = new StartSlackOAuthUseCase(slackRuntimeConfig);
	const completeSlackOAuth = new CompleteSlackOAuthUseCase(knowledgeConnectorRepository, slackWorkspaceRepository, slackChannelRepository, slackClient, slackRuntimeConfig);
	const listSlackChannels = new ListSlackChannelsUseCase(knowledgeConnectorRepository, slackWorkspaceRepository, slackChannelRepository);
	const selectSlackChannels = new SelectSlackChannelsUseCase(knowledgeConnectorRepository, slackWorkspaceRepository, slackChannelRepository, pipelineJobRepository, slackIngestQueue, sourceSyncQueue);
	const syncSlack = new SyncSlackUseCase(knowledgeConnectorRepository, slackWorkspaceRepository, pipelineJobRepository, slackSyncQueue, sourceSyncQueue);

	// --- Provider Platform: registry, registrations, vault, state, events ----
	const integrationRepository = new PostgresIntegrationRepository(pgPool);
	const integrationCredentialRepository = new PostgresIntegrationCredentialRepository(pgPool);
	const integrationResourceRepository = new PostgresIntegrationResourceRepository(pgPool);
	const providerRegistrationRepository = new PostgresProviderRegistrationRepository(pgPool);

	// The vault's cipher: refuses (503) instead of failing boot when no key is set.
	const integrationKey = env.INTEGRATION_ENCRYPTION_KEY ?? env.ORG_KEY_ENCRYPTION_KEY;
	const requireIntegrationKey = (): string => {
		if (!integrationKey) throw new ProviderNotConfiguredError('platform', 'Set INTEGRATION_ENCRYPTION_KEY (or ORG_KEY_ENCRYPTION_KEY) to use integrations');
		return integrationKey;
	};
	const secretCipher = {
		encrypt: (plaintext: string) => encryptSecret(requireIntegrationKey(), plaintext),
		decrypt: (ciphertext: string) => decryptSecret(requireIntegrationKey(), ciphertext),
	};
	const credentialVault = new CredentialVault(integrationCredentialRepository, secretCipher);
	const registrationVault = new CredentialVault(new PostgresProviderRegistrationCredentialRepository(pgPool), secretCipher);

	// The Provider Registration layer: virtual managed registrations from
	// deployment env, BYOA registrations from the DB. App credentials resolve
	// here — before an Integration exists — dissolving the OAuth circular dep.
	const managedRegistrations = buildManagedRegistrations(env);
	const providerRegistrationService = new ProviderRegistrationService(providerRegistrationRepository, registrationVault, managedRegistrations);

	const providerRegistry = new ProviderRegistry();
	providerRegistry.register(createGitHubProvider({ transportFactory: createGitHubTransport }));
	providerRegistry.register(createSlackProvider({ transportFactory: createSlackTransport }));
	for (const comingSoon of COMING_SOON_PROVIDERS) providerRegistry.register(comingSoon);

	const oauthStates = new OAuthStateService(new PostgresOAuthStateRepository(pgPool));

	// Platform events ride Redis Pub/Sub: publish on the shared command
	// connection, subscribe on a DEDICATED connection (subscribe mode).
	const platformEventsRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
	const platformEventBus = new RedisPlatformEventBus(redis, platformEventsRedis);
	const integrationEventHub = new IntegrationEventHub(platformEventBus);
	integrationEventHub.start();

	const listProviders = new ListProvidersUseCase(providerRegistry, providerRegistrationService);
	const listIntegrations = new ListIntegrationsUseCase(integrationRepository, knowledgeConnectorRepository);
	const connectProvider = new ConnectProviderUseCase(providerRegistry, oauthStates, projectRepository, providerRegistrationService);
	const completeConnect = new CompleteConnectUseCase(providerRegistry, oauthStates, integrationRepository, integrationResourceRepository, credentialVault, platformEventBus, providerRegistrationService);
	const reconnectIntegration = new ReconnectIntegrationUseCase(providerRegistry, oauthStates, integrationRepository, providerRegistrationService);
	const disconnectIntegration = new DisconnectIntegrationUseCase(providerRegistry, integrationRepository, knowledgeConnectorRepository, credentialVault, platformEventBus, providerRegistrationService);
	const listIntegrationResources = new ListIntegrationResourcesUseCase(providerRegistry, integrationRepository, integrationResourceRepository, knowledgeConnectorRepository, credentialVault, providerRegistrationService);
	const describeRegistration = new DescribeRegistrationUseCase(providerRegistry, providerRegistrationRepository, registrationVault);
	const configureRegistration = new ConfigureRegistrationUseCase(providerRegistry, providerRegistrationRepository, registrationVault);
	const deleteRegistration = new DeleteRegistrationUseCase(providerRegistrationRepository, registrationVault, integrationRepository);

	// Webhook receipt: deliveries are recorded + enqueued here and processed in
	// the worker; secret verification resolves via the registration layer.
	const webhookEventRepository = new PostgresWebhookEventRepository(pgPool);
	const webhookEventsQueue = createWebhookEventsQueue(bullRedis);
	// Webhooks are pre-auth, so the per-key limiter can't apply — use a
	// per-provider fixed window generous enough for bursty pushes. Falls back to an
	// in-process limiter if Redis is down rather than dropping throttling.
	const webhookLimiter = new FallbackRateLimiter(
		new RedisRateLimiter(redis, 600, 60),
		new InMemoryRateLimiter(600, 60),
		(err) => logger.warn({ err }, 'webhook rate limiter fell back to in-memory (redis unavailable)')
	);

	const attachSlackWorkspace = new AttachSlackWorkspaceUseCase(integrationRepository, knowledgeConnectorRepository, slackWorkspaceRepository, slackChannelRepository, credentialVault, slackClient);
	const connectRepositoryFromIntegration = new ConnectRepositoryFromIntegrationUseCase(
		integrationRepository,
		integrationResourceRepository,
		listIntegrationResources,
		knowledgeConnectorRepository,
		repositoryRepository,
		pipelineJobRepository,
		sourceSyncQueue
	);

	// --- AI Providers subsystem (org-configurable LLMs) --------------------
	// A first-class subsystem parallel to the Integrations platform. Reuses the
	// vault primitive + cipher; its own registry, tables, and resolution layer.
	const llmProviderConfigRepository = new PostgresLlmProviderConfigurationRepository(pgPool);
	const activeLlmProviderRepository = new PostgresActiveLlmProviderRepository(pgPool);
	const llmCredentialVault = new CredentialVault(new PostgresLlmProviderCredentialRepository(pgPool), secretCipher);
	const llmRegistry = createBuiltInLlmRegistry();
	// Makes RocketRide vendor-blind: resolves an org's active provider → node config.
	const llmResolutionService = new LlmResolutionService(llmRegistry, llmProviderConfigRepository, llmCredentialVault);

	// Chat is the one synchronous RocketRide path in the API: questions run
	// against each project's persistent chat pipeline (useExisting semantics
	// in PipelineRegistry), so the process holds one pooled client. Retrieval
	// itself happens outside RocketRide (VectorSearchContextRetriever, same
	// path as /search) — RocketRide's chat pipeline is a bare LLM call, see
	// chat-pipeline.ts for why.
	const rocketridePool = new RocketRideClientPool(env, logger);
	const pipelineRegistry = new PipelineRegistry(rocketridePool);
	const ragService = new RocketRideRagService(rocketridePool);
	// The resolver consults the active LLM provider; falls back to managed OpenAI when none is active.
	const chatPipelineResolver = new RocketRideChatPipelineResolver(pipelineRegistry, llmResolutionService);
	const chatContextRetriever = new VectorSearchContextRetriever(embeddingProviderFactory, qdrantSearchClient);
	const chatRepository = new PostgresChatRepository(pgPool);
	const slackCitationEnricher = new SlackCitationEnricher(slackConversationRepository);
	const askQuestion = new AskQuestionUseCase(chatRepository, ragService, chatPipelineResolver, chatContextRetriever, slackCitationEnricher);

	// AI Providers use cases. The change notifier invalidates the resolution cache
	// and the org's cached chat pipelines on connect/activate/disconnect, so a
	// provider switch takes effect on the next chat turn with no restart.
	const llmChangeNotifier = new InProcessLlmProviderChangeNotifier(llmResolutionService, projectRepository, chatPipelineResolver, logger);
	const listLlmProviders = new ListLlmProvidersUseCase(llmRegistry, llmProviderConfigRepository, activeLlmProviderRepository);
	const getLlmProvider = new GetLlmProviderUseCase(llmRegistry, llmProviderConfigRepository, activeLlmProviderRepository, llmCredentialVault);
	const connectLlmProvider = new ConnectLlmProviderUseCase(llmRegistry, llmProviderConfigRepository, llmCredentialVault, llmChangeNotifier);
	const testLlmProvider = new TestLlmProviderUseCase(llmRegistry, llmProviderConfigRepository, llmCredentialVault);
	const activateLlmProvider = new ActivateLlmProviderUseCase(llmRegistry, llmProviderConfigRepository, activeLlmProviderRepository, llmCredentialVault, llmChangeNotifier);
	const disconnectLlmProvider = new DisconnectLlmProviderUseCase(llmProviderConfigRepository, llmCredentialVault, llmChangeNotifier);
	const listLlmModels = new ListLlmModelsUseCase(llmRegistry, llmProviderConfigRepository, llmCredentialVault);

		const listConversations = new ListConversationsUseCase(chatRepository);
		const updateConversation = new UpdateConversationUseCase(chatRepository);
		const deleteConversation = new DeleteConversationUseCase(chatRepository);
		const getConversationMessages = new GetConversationMessagesUseCase(chatRepository);

		// Project Home aggregate stats — real counts composed from existing repositories.
		const getProjectStats = new GetProjectStatsUseCase(documentRepository, repositoryRepository, chatRepository);

	// Security (Step 9): API-key auth → per-key rate limit → audit. Constructed
	// before routing so the guards can be mounted around the data controllers.
	const apiKeyRepository = new PostgresApiKeyRepository(pgPool);
	const auditLogRepository = new PostgresAuditLogRepository(pgPool);
	const authenticate = new AuthenticateApiKeyUseCase(apiKeyRepository, env.PLATFORM_API_KEY_PEPPER);
	const rateLimiter = new FallbackRateLimiter(
		new RedisRateLimiter(redis, env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_SEC),
		new InMemoryRateLimiter(env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_SEC),
		(err) => logger.warn({ err }, 'rate limiter fell back to in-memory (redis unavailable)')
	);

	const app = express();
	// Honour X-Forwarded-For for accurate client IPs in audit logs (behind a
	// load balancer / ingress). Rate limits key on the API key, not the IP.
	app.set('trust proxy', true);
	app.use(pinoHttp({ logger }));

	// Prometheus: time every request (mounted early) and expose /metrics (public,
	// token-gated). See modules/observability/metrics.ts.
	const metrics = createMetrics({ token: env.METRICS_TOKEN });
	app.use(metrics.httpMiddleware);
	app.get('/metrics', metrics.metricsHandler);

	// Public webhook receiver — MUST precede express.json(): provider
	// signatures cover the exact raw bytes, so nothing may parse the body first.
	app.use(
		createWebhooksController({
			registry: providerRegistry,
			integrations: integrationRepository,
			webhookEvents: webhookEventRepository,
			webhookQueue: webhookEventsQueue,
			registrations: providerRegistrationService,
			limiter: webhookLimiter,
			logger,
		})
	);

	app.use(express.json());

	// Public: health/readiness probes must answer without credentials.
	app.use(createHealthController(checkHealth));

	// Everything below requires a valid API key, is rate-limited per key, and
	// (for mutations) audited. Order matters: authenticate → throttle → audit.
	app.use(authGuard(authenticate));
	app.use(rateLimitGuard(rateLimiter));
	app.use(auditLogMiddleware(auditLogRepository));

	app.use(createProjectsController({ createProject, deleteProject, getProject, getProjectStats, listProjects }));
	app.use(createDocumentsController({ getProject, uploadDocument, listDocuments, deleteDocument, getDocumentContent }));
	app.use(createJobsController({ getProject, getJobStatus, listProjectJobs, jobEventStream: jobEventHub }));
	app.use(createRepositoriesController({ getProject, connectGitHub, connectFromIntegration: connectRepositoryFromIntegration, uploadZip, syncRepository, listRepositories, deleteRepository }));
	app.use(createConnectorsController({ getProject, listConnectors, deleteConnector }));
	app.use(
		createIntegrationsController({
			listProviders,
			listIntegrations,
			connectProvider,
			completeConnect,
			reconnectIntegration,
			disconnectIntegration,
			listIntegrationResources,
			describeRegistration,
			configureRegistration,
			deleteRegistration,
			integrationEvents: integrationEventHub,
		})
	);
	app.use(
		createLlmProvidersController({
			listLlmProviders,
			getLlmProvider,
			connectLlmProvider,
			testLlmProvider,
			activateLlmProvider,
			disconnectLlmProvider,
			listLlmModels,
		})
	);
	app.use(createSlackController({ getProject, startOAuth: startSlackOAuth, completeOAuth: completeSlackOAuth, attachWorkspace: attachSlackWorkspace, listChannels: listSlackChannels, selectChannels: selectSlackChannels, syncSlack }));
	app.use(createChatController({ getProject, askQuestion, listConversations, updateConversation, deleteConversation, getConversationMessages }));

	const server = app.listen(env.PLATFORM_PORT, () => {
		logger.info({ port: env.PLATFORM_PORT }, 'platform-api listening');
	});

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		server.close();
		await Promise.all([ingestQueue.close(), repoIngestQueue.close(), repoSyncQueue.close(), slackIngestQueue.close(), slackSyncQueue.close(), sourceSyncQueue.close(), webhookEventsQueue.close()]);
		await rocketridePool.shutdown();
		await redis.quit();
		await bullRedis.quit();
		await jobEventsRedis.quit();
		await platformEventsRedis.quit();
		await pgPool.end();
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
	console.error('Fatal error during bootstrap:', err);
	process.exit(1);
});