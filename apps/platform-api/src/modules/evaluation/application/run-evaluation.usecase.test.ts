import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@meshify/data-access';
import type { ChatAnswer, ChatTurnRequest, RagPort } from '@meshify/rocketride-gateway';
import type { ChatPipelineResolver } from '../../chat/application/chat-pipeline.port.js';
import type { ChatContextRetriever } from '../../chat/application/chat-context-retriever.port.js';
import type { RetrievedChunk } from '../../chat/domain/build-rag-prompt.js';
import { RunEvaluationUseCase } from './run-evaluation.usecase.js';
import type { GoldenCase } from '../domain/golden-case.js';

const PROJECT = { id: 'proj-1' } as unknown as Project;

const NO_CONTEXT: ChatContextRetriever = { retrieve: async () => [] };

/** ChatContextRetriever fake driven by a per-question map of chunks (first chunk's score becomes confidence). */
function contextFor(byQuestion: Record<string, RetrievedChunk[]>): ChatContextRetriever {
	return { retrieve: async (_project, query) => byQuestion[query] ?? [] };
}

function answer(text: string, overrides: Partial<ChatAnswer> = {}): ChatAnswer {
	return {
		answer: text,
		latencyMs: 50,
		tokenUsage: { prompt: 10, completion: 20, total: 30 },
		...overrides,
	};
}

/**
 * RagPort fake driven by a per-question map; a value that is an Error is
 * thrown. Matches on the golden case's original question text, which
 * buildRagPrompt always appends as a trailing "Question: <text>" line.
 */
function fakeRag(byQuestion: Record<string, ChatAnswer | Error>) {
	const asked: string[] = [];
	const rag: RagPort = {
		async ask(_token: string, turn: ChatTurnRequest) {
			const match = /Question: ([\s\S]*)$/.exec(turn.question);
			const question = match?.[1] ?? turn.question;
			asked.push(question);
			const result = byQuestion[question];
			if (result instanceof Error) throw result;
			if (!result) throw new Error(`unexpected question: ${question}`);
			return result;
		},
		ingestFiles: async () => ({ completed: true, errors: [] }),
	};
	return { rag, asked };
}

const resolver: ChatPipelineResolver = { resolve: async () => 'token-abc', invalidate: () => {} };

describe('RunEvaluationUseCase', () => {
	it('scores each case and aggregates pass rate, confidence, latency and tokens', async () => {
		const cases: GoldenCase[] = [
			{ id: 'a', question: 'q1', expectedKeywords: ['yes'] },
			{ id: 'b', question: 'q2', expectedKeywords: ['present'] },
		];
		const { rag } = fakeRag({
			q1: answer('yes it is', { latencyMs: 100 }),
			q2: answer('not here', { latencyMs: 200 }),
		});
		const context = contextFor({
			q1: [{ sourcePath: 'a.md', content: '', score: 0.8 }],
			q2: [{ sourcePath: 'b.md', content: '', score: 0.6 }],
		});

		const report = await new RunEvaluationUseCase(rag, resolver, context).execute(PROJECT, cases);

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
		const context = contextFor({ ok: [{ sourcePath: 'c.md', content: '', score: 0.9 }] });

		const report = await new RunEvaluationUseCase(rag, resolver, context).execute(PROJECT, cases);

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
		const context = contextFor({
			q1: [{ sourcePath: 'a.md', content: '', score: 0.9 }],
			q2: [{ sourcePath: 'b.md', content: '', score: 0.9 }],
		});

		await new RunEvaluationUseCase(rag, { resolve: resolveSpy, invalidate: () => {} }, context).execute(PROJECT, cases);
		expect(resolveSpy).toHaveBeenCalledOnce();
	});

	it('reports a 0 pass rate and zeroed averages for an all-error run', async () => {
		const { rag } = fakeRag({ q1: new Error('down') });
		const report = await new RunEvaluationUseCase(rag, resolver, NO_CONTEXT).execute(PROJECT, [{ id: 'a', question: 'q1', expectedKeywords: ['x'] }]);
		expect(report.passRate).toBe(0);
		expect(report.averageConfidence).toBe(0);
		expect(report.averageLatencyMs).toBe(0);
		expect(report.totalTokens).toBe(0);
	});
});
