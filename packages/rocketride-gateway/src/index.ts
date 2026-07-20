export { RocketRideClientPool } from './client-pool.js';
export type { ClientPoolLogger } from './client-pool.js';

export { PipelineRegistry } from './pipeline-registry.js';

export { RocketRideRagService } from './rag.service.js';
export { FakeRagService } from './rag.service.fake.js';
export type { RagPort, ChatAnswer, ChatTurnRequest, ChatHistoryTurn, ChatCitation, RetrievedDocument, IngestFile, IngestResult } from './rag.port.js';

export { buildIngestPipeline, buildChatPipeline } from './pipeline-builder/index.js';
export type {
	LlmProvider,
	LlmComponent,
	EmbeddingProvider,
	IngestTarget,
	LlmProviderConfig,
	ManagedLlmConfig,
	ResolvedLlmConfig,
	EmbeddingProviderConfig,
	QdrantTargetConfig,
	ProjectPipelineConfig,
	IngestPipelineConfig,
	ChatPipelineConfig,
	RocketRideComponent,
	RocketRidePipeline,
} from './pipeline-builder/index.js';
