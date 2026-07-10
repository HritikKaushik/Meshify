import { Router } from 'express';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import type { RunEvaluationUseCase } from '../application/run-evaluation.usecase.js';
import { runEvaluationSchema } from './dto.js';

export function createEvaluationController(deps: { getProject: GetProjectUseCase; runEvaluation: RunEvaluationUseCase }): Router {
	const router = Router();
	const guard = projectIsolationGuard(deps.getProject);

	router.post('/v1/projects/:projectId/evaluation/run', guard, async (req, res) => {
		const parsed = runEvaluationSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}

		try {
			const report = await deps.runEvaluation.execute(req.project!, parsed.data.cases);
			res.status(200).json(report);
		} catch (err) {
			req.log?.error({ err }, 'evaluation run failed to start');
			// Per-case RAG failures are captured in the report; reaching here means
			// the run couldn't even start (e.g. pipeline could not be resolved).
			res.status(502).json({ error: 'Evaluation could not run — the AI engine could not be reached' });
		}
	});

	return router;
}
