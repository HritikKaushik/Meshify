import { Router } from 'express';
import type { CheckHealthUseCase } from '../application/check-health.usecase.js';

export function createHealthController(checkHealth: CheckHealthUseCase): Router {
	const router = Router();

	// Liveness: process is up, no dependency checks.
	router.get('/health/live', (_req, res) => {
		res.status(200).json({ status: 'ok' });
	});

	// Readiness: all downstream dependencies reachable.
	router.get('/health/ready', async (_req, res) => {
		const report = await checkHealth.execute();
		res.status(report.status === 'ok' ? 200 : 503).json(report);
	});

	return router;
}
