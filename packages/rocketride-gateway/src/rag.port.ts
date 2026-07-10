/**
 * Domain-facing port for RAG operations. No RocketRide SDK types appear here —
 * this is the DIP seam application code depends on; only rocketride-gateway's
 * RocketRideRagService (or a test FakeRagService) implements it.
 */

export interface ChatHistoryTurn {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface ChatTurnRequest {
	question: string;
	history?: ChatHistoryTurn[];
}

export interface RetrievedDocument {
	id: string;
	sourcePath: string;
	score: number;
}

export interface ChatCitation {
	sourcePath: string;
	chunkId?: string;
	score: number;
}

export interface ChatAnswer {
	answer: string;
	citations: ChatCitation[];
	retrievedDocuments: RetrievedDocument[];
	confidence: number;
	modelUsed?: string;
	tokenUsage?: { prompt: number; completion: number; total: number };
	latencyMs: number;
}

export interface IngestFile {
	path: string;
	buffer: Buffer;
	mimeType?: string;
}

export interface IngestResult {
	completed: boolean;
	errors: string[];
}

export interface RagPort {
	/** Ask a question against an already-running chat pipeline, identified by its task token. */
	ask(pipelineToken: string, turn: ChatTurnRequest): Promise<ChatAnswer>;

	/** Send files into an already-running ingestion pipeline, identified by its task token. */
	ingestFiles(pipelineToken: string, files: IngestFile[]): Promise<IngestResult>;
}
