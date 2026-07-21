import { Router } from 'express';
import type { CheckHealthUseCase } from '../application/check-health.usecase.js';

interface HealthLogger {
	warn: (obj: unknown, msg: string) => void;
}

export function createHealthController(checkHealth: CheckHealthUseCase, logger?: HealthLogger): Router {
	const router = Router();

	// Liveness: process is up, no dependency checks.
	router.get('/health/live', (_req, res) => {
		res.status(200).json({ status: 'ok' });
	});

	// Readiness: all downstream dependencies reachable.
	router.get('/health/ready', async (_req, res) => {
		const report = await checkHealth.execute();
		if (report.status !== 'ok') {
			// The 503 otherwise surfaces only as a generic "request errored" line, which
			// hides WHICH dependency failed — name it (and its error) so a failed
			// platform healthcheck is diagnosable straight from the deploy logs.
			const down = report.dependencies.filter((d) => d.status !== 'up');
			logger?.warn({ down }, `readiness degraded: ${down.map((d) => `${d.name} (${d.error ?? 'no detail'})`).join(', ')}`);
		}
		res.status(report.status === 'ok' ? 200 : 503).json(report);
	});

	return router;
}
