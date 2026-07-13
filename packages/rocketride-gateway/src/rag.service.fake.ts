import type { ChatAnswer, ChatTurnRequest, IngestFile, IngestResult, RagPort } from './rag.port.js';

/**
 * In-memory RagPort implementation for use-case unit tests. Records every
 * call so tests can assert on what was asked/ingested without a live
 * RocketRide server, Qdrant, or LLM provider.
 */
export class FakeRagService implements RagPort {
	readonly askCalls: Array<{ pipelineToken: string; turn: ChatTurnRequest }> = [];
	readonly ingestCalls: Array<{ pipelineToken: string; files: IngestFile[] }> = [];

	nextAnswer: ChatAnswer = {
		answer: 'This is a fake answer.',
		latencyMs: 1,
	};

	nextIngestResult: IngestResult = { completed: true, errors: [] };

	async ask(pipelineToken: string, turn: ChatTurnRequest): Promise<ChatAnswer> {
		this.askCalls.push({ pipelineToken, turn });
		return this.nextAnswer;
	}

	async ingestFiles(pipelineToken: string, files: IngestFile[]): Promise<IngestResult> {
		this.ingestCalls.push({ pipelineToken, files });
		return this.nextIngestResult;
	}
}
