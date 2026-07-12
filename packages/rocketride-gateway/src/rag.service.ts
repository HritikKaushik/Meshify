import { Question } from 'rocketride';
import type { RocketRideClientPool } from './client-pool.js';
import type { ChatAnswer, ChatTurnRequest, IngestFile, IngestResult, RagPort } from './rag.port.js';

interface RocketRideAnswerResponse {
	answers?: string[];
	documents?: Array<{ id?: string; source_path?: string; sourcePath?: string; score?: number }>;
	result_types?: Record<string, string>;
	name?: string;
	[key: string]: unknown;
}

function extractByLaneType(response: RocketRideAnswerResponse, laneType: string): unknown[] | undefined {
	const resultTypes = response.result_types ?? {};
	for (const [key, type] of Object.entries(resultTypes)) {
		if (type === laneType) return response[key] as unknown[] | undefined;
	}
	// Fall back to the default key for callers that never customized laneName.
	return response[laneType] as unknown[] | undefined;
}

export class RocketRideRagService implements RagPort {
	constructor(private readonly pool: RocketRideClientPool) {}

	async ask(pipelineToken: string, turn: ChatTurnRequest): Promise<ChatAnswer> {
		const client = await this.pool.getClient();

		const question = new Question();
		question.addQuestion(turn.question);
		for (const historyTurn of turn.history ?? []) {
			question.addHistory(historyTurn);
		}

		const start = performance.now();
		const response = (await client.chat({ token: pipelineToken, question })) as RocketRideAnswerResponse;
		const latencyMs = Math.round(performance.now() - start);

		const answers = extractByLaneType(response, 'answers') as string[] | undefined;
		const documents = (extractByLaneType(response, 'documents') as RocketRideAnswerResponse['documents']) ?? [];

		const retrievedDocuments = documents.map((doc, index) => ({
			id: doc.id ?? `doc-${index}`,
			sourcePath: doc.sourcePath ?? doc.source_path ?? 'unknown',
			score: doc.score ?? 0,
		}));

		return {
			answer: answers?.[0] ?? 'No answer received.',
			citations: retrievedDocuments.map((doc) => ({ sourcePath: doc.sourcePath, chunkId: doc.id, score: doc.score })),
			retrievedDocuments,
			confidence: retrievedDocuments[0]?.score ?? 0,
			latencyMs,
		};
	}

	async ingestFiles(pipelineToken: string, files: IngestFile[]): Promise<IngestResult> {
		const client = await this.pool.getClient();

		const results = await client.sendFiles(
			files.map((f) => ({ file: bufferToFile(f), mimetype: f.mimeType })),
			pipelineToken
		);

		const errors = results.filter((r) => r.action === 'error').map((r) => r.error ?? `Upload failed for ${r.filepath}`);
		return { completed: errors.length === 0, errors };
	}
}

/**
 * RocketRide's TS SDK expects a browser-style File (Node 20+/undici global).
 *
 * Defensive: copy into a standalone Uint8Array first. Node's `Buffer.from()`
 * pools small buffers and streamed/S3 buffers may be views into a larger
 * allocation; a straight `new File([buffer])` then risks carrying the whole
 * backing ArrayBuffer. (Note: this is NOT the cause of the current cloud
 * ingestion failure — wire capture proves we transmit the exact bytes and the
 * corruption is server-side in RocketRide's binary pipe — but keeping the copy
 * is cheap, correct hardening regardless of where the buffer originates.)
 */
function bufferToFile(f: IngestFile): File {
	const bytes = new Uint8Array(f.buffer.byteLength);
	bytes.set(f.buffer);
	return new File([bytes], f.path, { type: f.mimeType ?? 'application/octet-stream' });
}
