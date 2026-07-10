import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@meshify/data-access';
import type { ChatAnswer, ChatTurnRequest, RagPort } from '@meshify/rocketride-gateway';
import type { ChatPipelineResolver } from '../../chat/application/chat-pipeline.port.js';
import { RunEvaluationUseCase } from './run-evaluation.usecase.js';
import type { GoldenCase } from '../domain/golden-case.js';

const PROJECT = { id: 'proj-1' } as unknown as Project;

function answer(text: string, overrides: Partial<ChatAnswer> = {}): ChatAnswer {
	return {
		answer: text,
		citations: [],
		retrievedDocuments: [],
		confidence: 0.9,
		latencyMs: 50,
		tokenUsage: { prompt: 10, completion: 20, total: 30 },
		...overrides,
	};
}

/** RagPort fake driven by a per-question map; a value that is an Error is thrown. */
function fakeRag(byQuestion: Record<string, ChatAnswer | Error>) {
	const asked: string[] = [];
	const rag: RagPort = {
		async ask(_token: string, turn: ChatTurnRequest) {
			asked.push(turn.question);
			const result = byQuestion[turn.question];
			if (result instanceof Error) throw result;
			if (!result) throw new Error(`unexpected question: ${turn.question}`);
			return result;
		},
		ingestFiles: async () => ({ completed: true, errors: [] }),
	};
	return { rag, asked };
}

const resolver: ChatPipelineResolver = { resolve: async () => 'token-abc' };

describe('RunEvaluationUseCase', () => {
	it('scores each case and aggregates pass rate, confidence, latency and tokens', async () => {
		const cases: GoldenCase[] = [
			{ id: 'a', question: 'q1', expectedKeywords: ['yes'] },
			{ id: 'b', question: 'q2', expectedKeywords: ['present'] },
		];
		const { rag } = fakeRag({
			q1: answer('yes it is', { confidence: 0.8, latencyMs: 100 }),
			q2: answer('not here', { confidence: 0.6, latencyMs: 200 }),
		});

		const report = await new RunEvaluationUseCase(rag, resolver).execute(PROJECT, cases);

		expect(report.total).toBe(2);
		expect(report.passed).toBe(1);
		expect(report.failed).toBe(1);
		expect(report.passRate).toBe(0.5);
		expect(report.averageConfidence).toBe(0.7);
		expect(report.averageLatencyMs).toBe(150);
		expect(report.totalTokens).toBe(60);
		expect(report.projectId).toBe('proj-1');
		expect(report.cases.map((c) => c.passed)).toEqual([true, false]);
	});

	it('isolates a per-case RAG failure: it is marked failed but the run completes', async () => {
		const cases: GoldenCase[] = [
			{ id: 'a', question: 'boom', expectedKeywords: ['x'] },
			{ id: 'b', question: 'ok', expectedKeywords: ['fine'] },
		];
		const { rag, asked } = fakeRag({ boom: new Error('engine down'), ok: answer('this is fine') });

		const report = await new RunEvaluationUseCase(rag, resolver).execute(PROJECT, cases);

		expect(asked).toEqual(['boom', 'ok']); // continued past the failure
		expect(report.cases[0]).toMatchObject({ passed: false, error: 'engine down' });
		expect(report.cases[1]?.passed).toBe(true);
		expect(report.passed).toBe(1);
		// Errored case excluded from quality averages (would otherwise skew to 0).
		expect(report.averageConfidence).toBe(0.9);
	});

	it('resolves the chat pipeline once and reuses the token for every case', async () => {
		const resolveSpy = vi.fn(async () => 'token-xyz');
		const { rag } = fakeRag({ q1: answer('a'), q2: answer('b') });
		const cases: GoldenCase[] = [
			{ id: 'a', question: 'q1', minConfidence: 0.5 },
			{ id: 'b', question: 'q2', minConfidence: 0.5 },
		];

		await new RunEvaluationUseCase(rag, { resolve: resolveSpy }).execute(PROJECT, cases);
		expect(resolveSpy).toHaveBeenCalledOnce();
	});

	it('reports a 0 pass rate and zeroed averages for an all-error run', async () => {
		const { rag } = fakeRag({ q1: new Error('down') });
		const report = await new RunEvaluationUseCase(rag, resolver).execute(PROJECT, [{ id: 'a', question: 'q1', expectedKeywords: ['x'] }]);
		expect(report.passRate).toBe(0);
		expect(report.averageConfidence).toBe(0);
		expect(report.averageLatencyMs).toBe(0);
		expect(report.totalTokens).toBe(0);
	});
});
