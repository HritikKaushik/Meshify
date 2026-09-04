import type { RequestHandler } from 'express';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';
import { bearerTokenMatches } from '@meshify/shared';

export interface Metrics {
	/** Times every HTTP request (labels: method, route pattern, status). Mount early. */
	httpMiddleware: RequestHandler;
	/** Renders the Prometheus exposition format; token-gated when `token` is set. */
	metricsHandler: RequestHandler;
}

/**
 * Prometheus instrumentation for platform-api: Node/process defaults + an HTTP
 * request-duration histogram. Exposed at `/metrics`.
 *
 * `/metrics` leaks internal detail, so when `METRICS_TOKEN` is set it requires
 * `Authorization: Bearer <token>` — set it in production and configure the same
 * token on the scraper (Grafana Agent / a ServiceMonitor bearerTokenSecret).
 * Unset (dev) leaves it open.
 */
export function createMetrics(opts: { token?: string } = {}): Metrics {
	const registry = new Registry();
	collectDefaultMetrics({ register: registry });

	const httpDuration = new Histogram({
		name: 'http_request_duration_seconds',
		help: 'HTTP request duration in seconds',
		labelNames: ['method', 'route', 'status'],
		buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
		registers: [registry],
	});

	const httpMiddleware: RequestHandler = (req, res, next) => {
		if (req.path === '/metrics') {
			next(); // don't measure the scrape itself
			return;
		}
		const end = httpDuration.startTimer({ method: req.method });
		res.on('finish', () => {
			// The MATCHED route pattern keeps label cardinality bounded (e.g.
			// `/v1/projects/:projectId/documents/:documentId`, not each real id).
			const route = typeof req.route?.path === 'string' ? req.route.path : req.route ? 'matched' : 'unmatched';
			end({ route, status: String(res.statusCode) });
		});
		next();
	};

	const metricsHandler: RequestHandler = async (req, res) => {
		if (opts.token && !bearerTokenMatches(req.get('authorization'), opts.token)) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}
		res.setHeader('Content-Type', registry.contentType);
		res.send(await registry.metrics());
	};

	return { httpMiddleware, metricsHandler };
}
