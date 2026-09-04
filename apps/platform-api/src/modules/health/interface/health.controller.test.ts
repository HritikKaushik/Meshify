import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CheckHealthUseCase } from '../application/check-health.usecase.js';
import type { DependencyChecker } from '../domain/dependency-check.js';
import { createHealthController } from './health.controller.js';

function checker(name: string, status: 'up' | 'down', error?: string): DependencyChecker {
	return { name, check: async () => ({ name, status, latencyMs: 1, ...(error ? { error } : {}) }) };
}

describe('health controller', () => {
	let server: Server;
	let origin: string;
	const warn = vi.fn();

	beforeAll(async () => {
		const app = express();
		app.use(
			createHealthController(
				new CheckHealthUseCase([checker('postgres', 'up'), checker('redis', 'down', 'connect ECONNREFUSED 10.0.3.7:6379 (password rejected)')]),
				{ warn }
			)
		);
		await new Promise<void>((resolve) => {
			server = app.listen(0, '127.0.0.1', () => {
				origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
				resolve();
			});
		});
	});
	afterAll(async () => new Promise<void>((resolve) => server.close(() => resolve())));

	it('reports which dependency is down without exposing its error text, and logs the detail instead', async () => {
		const res = await fetch(`${origin}/health/ready`);
		expect(res.status).toBe(503);
		const body = (await res.json()) as { status: string; dependencies: Array<Record<string, unknown>> };
		expect(body.status).toBe('degraded');
		expect(body.dependencies.find((d) => d.name === 'redis')).toEqual({ name: 'redis', status: 'down', latencyMs: 1 });
		expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[1]).toContain('ECONNREFUSED');
	});

	it('answers liveness without touching dependencies', async () => {
		const res = await fetch(`${origin}/health/live`);
		expect(res.status).toBe(200);
	});
});
