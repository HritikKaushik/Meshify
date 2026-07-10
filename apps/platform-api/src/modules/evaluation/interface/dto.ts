import { z } from 'zod';

/** Upper bound on golden-set size — the run is synchronous and sequential, so
 * cap it to keep the request bounded. Split larger suites across calls. */
export const MAX_CASES = 50;

const goldenCaseSchema = z
	.object({
		id: z.string().min(1).max(200),
		question: z.string().min(1).max(8000),
		expectedKeywords: z.array(z.string().min(1)).max(50).optional(),
		anyKeywords: z.array(z.string().min(1)).max(50).optional(),
		forbiddenKeywords: z.array(z.string().min(1)).max(50).optional(),
		expectedSources: z.array(z.string().min(1)).max(50).optional(),
		minConfidence: z.number().min(0).max(1).optional(),
	})
	.refine(
		(c) =>
			Boolean(c.expectedKeywords?.length || c.anyKeywords?.length || c.forbiddenKeywords?.length || c.expectedSources?.length || c.minConfidence !== undefined),
		{ message: 'Each case must specify at least one expectation' }
	);

export const runEvaluationSchema = z.object({
	cases: z.array(goldenCaseSchema).min(1).max(MAX_CASES),
});

export type RunEvaluationDto = z.infer<typeof runEvaluationSchema>;
