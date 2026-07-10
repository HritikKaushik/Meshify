import { finalizePipeline, type RocketRidePipeline } from './rocketride-pipeline.js';
import { embeddingNode, parseNode, preprocessorNode, qdrantStoreNode, sourceNode } from './nodes.js';
import type { IngestPipelineConfig } from './types.js';

/**
 * webhook -> parse -> preprocessor_langchain -> embedding_<profile> -> qdrant
 * Terminal store node, no response node (per RocketRide ingestion convention).
 * One of these exists per project per target ('documents' or 'code') since
 * RocketRide pipelines can't route a single item to two different vector
 * collections dynamically.
 */
export function buildIngestPipeline(config: IngestPipelineConfig): RocketRidePipeline {
	const webhook = sourceNode('webhook_1', 'webhook');
	const parse = parseNode('parse_1', webhook.id);
	const preprocessor = preprocessorNode('preprocessor_langchain_1', parse.id, config.chunkSize);
	const embedding = embeddingNode('embedding_1', preprocessor.id, 'documents', config.embedding);
	const qdrant = qdrantStoreNode('qdrant_1', embedding.id, config.qdrant);

	return finalizePipeline([webhook, parse, preprocessor, embedding, qdrant], webhook.id, config.pipelineGuid);
}
