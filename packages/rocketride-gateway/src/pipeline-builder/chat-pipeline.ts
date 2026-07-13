import { finalizePipeline, type RocketRidePipeline } from './rocketride-pipeline.js';
import { llmNode, responseAnswersNode, sourceNode } from './nodes.js';
import type { ChatPipelineConfig } from './types.js';

/**
 * chat -> llm_<profile> -> response_answers
 *
 * Deliberately bypasses RocketRide's own qdrant/prompt nodes for retrieval.
 * The qdrant component's config schema (.rocketride/schema/qdrant.json) only
 * exposes a `score` floor (a fixed enum: 0/0.4/0.6/0.7/0.8/0.9/1) — there is no
 * result-count cap. On a nontrivial code collection that meant ~25 sizeable
 * chunks landing in the prompt node regardless of the score chosen, and
 * empirically the LLM then stopped grounding on them at all — it answered
 * generically even when the exact right file was in the (correctly retrieved)
 * document list. Retrieval + top-N selection + prompt assembly now happen in
 * platform-api (ChatContextRetriever + buildRagPrompt) before the question
 * ever reaches RocketRide, so this pipeline is intentionally just an LLM call.
 * Persistent pipeline: started once per project with useExisting: true, reused for every chat turn.
 */
export function buildChatPipeline(config: ChatPipelineConfig): RocketRidePipeline {
	const chat = sourceNode('chat_1', 'chat');
	const llm = llmNode('llm_1', chat.id, config.llm);
	const response = responseAnswersNode('response_answers_1', llm.id);

	return finalizePipeline([chat, llm, response], chat.id, config.pipelineGuid);
}
