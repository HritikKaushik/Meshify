import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request, RequestHandler } from 'express';

/** Public 1:1 proxy for the health probe — no Clerk session required, mirrors platform-api's own public route. */
export function createHealthProxy(platformApiOrigin: string): RequestHandler {
	return createProxyMiddleware({
		target: platformApiOrigin,
		changeOrigin: true,
		pathRewrite: { '^/api/health': '/health/ready' },
	});
}

/**
 * 1:1 streaming proxy for every authenticated /v1/* route. Streams the
 * request body through unparsed (no express.json()/multer on this path) so
 * multipart uploads (documents, repository ZIPs) pass through byte-identical
 * instead of being buffered and re-serialized. Injects the Clerk session's
 * resolved org API key as the Authorization header — the browser's own
 * request never carries platform-api credentials.
 *
 * Mounted via `app.use('/api/v1', protectedRouter)`, so by the time this
 * middleware runs, Express has already stripped the `/api/v1` mount prefix
 * from `req.url` (e.g. `/projects`, not `/api/v1/projects`) — pathRewrite
 * re-adds the `/v1` platform-api expects rather than stripping it.
 */
export function createPlatformApiProxy(platformApiOrigin: string): RequestHandler {
	return createProxyMiddleware({
		target: platformApiOrigin,
		changeOrigin: true,
		pathRewrite: (path) => `/v1${path}`,
		on: {
			proxyReq: (proxyReq, req) => {
				const apiKey = (req as Request).meshify?.apiKey;
				if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
			},
		},
	});
}
