import type { Router } from 'express';
import { createRouter } from '../../../http/router.js';
import type { CheckHealthUseCase } from '../application/check-health.usecase.js';

interface HealthLogger {
	warn: (obj: unknown, msg: string) => void;
}

export function createHealthController(checkHealth: CheckHealthUseCase, logger?: HealthLogger): Router {
	const router = createRouter();

	// Liveness: process is up, no dependency checks.
	router.get('/health/live', (_req, res) => {
		res.status(200).json({ status: 'ok' });
	});

	// Readiness: all downstream dependencies reachable. The route is public
	// (probes carry no credentials), so the body names the dependency and its
	// state but never the driver's error text, which can carry hosts, ports and
	// auth detail; that goes to the log, where a failed deploy healthcheck is
	// diagnosed from.
	router.get('/health/ready', async (_req, res) => {
		const report = await checkHealth.execute();
		if (report.status !== 'ok') {
			const down = report.dependencies.filter((d) => d.status !== 'up');
			logger?.warn({ down }, `readiness degraded: ${down.map((d) => `${d.name} (${d.error ?? 'no detail'})`).join(', ')}`);
		}
		const dependencies = report.dependencies.map(({ name, status, latencyMs }) => ({ name, status, latencyMs }));
		res.status(report.status === 'ok' ? 200 : 503).json({ status: report.status, dependencies });
	});

	return router;
}
