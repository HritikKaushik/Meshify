import http from 'node:http';
import { Queue, type ConnectionOptions } from 'bullmq';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

export interface MetricsServer {
	close(): Promise<void>;
}

/**
 * The worker has no request surface of its own, so this stands up a tiny HTTP
 * server exposing:
 *   - `GET /healthz`  — liveness (process is up), used by the container HEALTHCHECK.
 *   - `GET /metrics`  — Prometheus: process/Node defaults + `meshify_queue_jobs`
 *     (BullMQ counts by queue and state), token-gated by METRICS_TOKEN.
 *
 * Queue depth is read lazily on each scrape via lightweight `Queue` handles that
 * share the worker's Redis connection (they only count; they never process).
 */
export function startMetricsServer(opts: {
	port: number;
	token?: string;
	connection: ConnectionOptions;
	queueNames: string[];
}): MetricsServer {
	const registry = new Registry();
	collectDefaultMetrics({ register: registry });

	const queues = opts.queueNames.map((name) => new Queue(name, { connection: opts.connection }));

	new Gauge({
		name: 'meshify_queue_jobs',
		help: 'BullMQ job counts by queue and state',
		labelNames: ['queue', 'state'],
		registers: [registry],
		async collect() {
			for (const queue of queues) {
				const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
				for (const state of ['waiting', 'active', 'delayed', 'failed'] as const) {
					this.set({ queue: queue.name, state }, counts[state] ?? 0);
				}
			}
		},
	});

	const server = http.createServer((req, res) => {
		if (req.method !== 'GET') {
			res.writeHead(405).end();
			return;
		}
		if (req.url === '/healthz') {
			res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
			return;
		}
		if (req.url === '/metrics') {
			if (opts.token && req.headers.authorization !== `Bearer ${opts.token}`) {
				res.writeHead(401).end('Unauthorized');
				return;
			}
			registry
				.metrics()
				.then((body) => res.writeHead(200, { 'content-type': registry.contentType }).end(body))
				.catch(() => res.writeHead(500).end());
			return;
		}
		res.writeHead(404).end();
	});
	server.listen(opts.port);

	return {
		close: async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await Promise.all(queues.map((queue) => queue.close()));
		},
	};
}
