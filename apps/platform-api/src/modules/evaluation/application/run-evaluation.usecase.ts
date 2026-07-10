import type { Project } from '@meshify/data-access';
import type { RagPort } from '@meshify/rocketride-gateway';
import type { ChatPipelineResolver } from '../../chat/application/chat-pipeline.port.js';
import { evaluateAnswer, type CaseResult, type GoldenCase } from '../domain/golden-case.js';

export interface EvaluationReport {
	projectId: string;
	total: number;
	passed: number;
	failed: number;
	/** passed / total, 0 when total is 0. Rounded to 4 dp. */
	passRate: number;
	averageConfidence: number;
	averageLatencyMs: number;
	totalTokens: number;
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	cases: CaseResult[];
}

function round(n: number, dp = 4): number {
	const f = 10 ** dp;
	return Math.round(n * f) / f;
}

/**
 * Runs a golden set through the project's real RAG chat pipeline and scores
 * each answer. Cases run SEQUENTIALLY against the single resolved pipeline
 * token (no assumption that RocketRide serves concurrent turns on one token)
 * and each is evaluated as an independent question with no shared history.
 * A RAG failure on one case is captured on that case and counts as failed —
 * it never aborts the run, so a report always covers every case.
 */
export class RunEvaluationUseCase {
	constructor(
		private readonly rag: RagPort,
		private readonly chatPipelines: ChatPipelineResolver
	) {}

	async execute(project: Project, cases: GoldenCase[]): Promise<EvaluationReport> {
		const startedAt = new Date();
		const pipelineToken = await this.chatPipelines.resolve(project);
		const results: CaseResult[] = [];

		for (const goldenCase of cases) {
			results.push(await this.runCase(pipelineToken, goldenCase));
		}

		const finishedAt = new Date();
		return this.aggregate(project.id, results, startedAt, finishedAt);
	}

	private async runCase(pipelineToken: string, goldenCase: GoldenCase): Promise<CaseResult> {
		try {
			const answer = await this.rag.ask(pipelineToken, { question: goldenCase.question });
			const { passed, checks } = evaluateAnswer(goldenCase, answer);
			return {
				id: goldenCase.id,
				question: goldenCase.question,
				passed,
				answer: answer.answer,
				confidence: answer.confidence,
				latencyMs: answer.latencyMs,
				tokens: answer.tokenUsage?.total ?? 0,
				citations: answer.citations.map((c) => c.sourcePath),
				checks,
			};
		} catch (err) {
			return {
				id: goldenCase.id,
				question: goldenCase.question,
				passed: false,
				answer: '',
				confidence: 0,
				latencyMs: 0,
				tokens: 0,
				citations: [],
				checks: [],
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	private aggregate(projectId: string, cases: CaseResult[], startedAt: Date, finishedAt: Date): EvaluationReport {
		const total = cases.length;
		const passed = cases.filter((c) => c.passed).length;
		// Averages are over cases that actually produced an answer (errored cases
		// contribute 0s that would skew the signal about model/retrieval quality).
		const answered = cases.filter((c) => !c.error);
		const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

		return {
			projectId,
			total,
			passed,
			failed: total - passed,
			passRate: total ? round(passed / total) : 0,
			averageConfidence: round(avg(answered.map((c) => c.confidence))),
			averageLatencyMs: Math.round(avg(answered.map((c) => c.latencyMs))),
			totalTokens: cases.reduce((sum, c) => sum + c.tokens, 0),
			startedAt: startedAt.toISOString(),
			finishedAt: finishedAt.toISOString(),
			durationMs: finishedAt.getTime() - startedAt.getTime(),
			cases,
		};
	}
}
