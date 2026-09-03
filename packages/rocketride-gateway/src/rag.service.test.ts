import { describe, expect, it } from 'vitest';
import type { RocketRideClientPool } from './client-pool.js';
import { RocketRidePipelineTimeoutError } from './pipeline-registry.js';
import { RocketRideRagService } from './rag.service.js';

const never = () => new Promise<never>(() => {});

function poolWith(client: Record<string, unknown>): RocketRideClientPool {
	return { getClient: async () => client } as unknown as RocketRideClientPool;
}

describe('RocketRideRagService timeouts', () => {
	it('bounds a chat turn: a wedged engine yields a timeout error instead of a hang', async () => {
		const rag = new RocketRideRagService(poolWith({ chat: never }), { chatTimeoutMs: 20 });
		await expect(rag.ask('tok', { question: 'q' })).rejects.toBeInstanceOf(RocketRidePipelineTimeoutError);
	});

	it('bounds an ingest batch the same way', async () => {
		const rag = new RocketRideRagService(poolWith({ sendFiles: never }), { ingestTimeoutMs: 20 });
		await expect(rag.ingestFiles('tok', [{ path: 'a.md', buffer: Buffer.from('x'), mimeType: 'text/markdown' }])).rejects.toBeInstanceOf(RocketRidePipelineTimeoutError);
	});

	it('returns normally (and clears its timer) when the engine answers in time', async () => {
		const rag = new RocketRideRagService(poolWith({ chat: async () => ({ answers: ['42'], result_types: { answers: 'answers' } }) }), { chatTimeoutMs: 1000 });
		const answer = await rag.ask('tok', { question: 'q' });
		expect(answer.answer).toBe('42');
	});
});
