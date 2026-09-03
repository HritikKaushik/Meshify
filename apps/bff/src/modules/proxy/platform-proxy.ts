import { createProxyMiddleware } from 'http-proxy-middleware';
import type { ClientRequest } from 'node:http';
import type { Request, RequestHandler } from 'express';

/**
 * Headers platform-api trusts from the BFF. Every one is SET (overwriting
 * whatever the browser sent) or removed, never passed through: the browser
 * must not be able to forge an org role, a user id, or its own address.
 */
const TRUSTED_HEADERS = ['authorization', 'x-meshify-org-role', 'x-meshify-user-id'] as const;

/**
 * Forward the client address platform-api should attribute the request to.
 * `req.ip` is the address Express resolved under this process's own
 * `trust proxy` setting, so platform-api can trust exactly one hop (the BFF)
 * regardless of how many proxies sit in front of the BFF.
 */
function forwardClientAddress(proxyReq: ClientRequest, req: Request): void {
	proxyReq.setHeader('X-Forwarded-For', req.ip ?? '');
	proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
	proxyReq.removeHeader('X-Real-IP');
}

/** Public 1:1 proxy for the health probe — no Clerk session required, mirrors platform-api's own public route. */
export function createHealthProxy(platformApiOrigin: string): RequestHandler {
	return createProxyMiddleware({
		target: platformApiOrigin,
		changeOrigin: true,
		pathRewrite: { '^/api/health': '/health/ready' },
	});
}

/**
 * Public passthrough for provider webhook deliveries (GitHub, Slack). The
 * platform-api is private in every supported deployment, so this is the only
 * way a delivery reaches it; the API verifies the provider signature over the
 * raw body itself, which is why the body streams through untouched and no
 * session, CSRF, or credential handling applies here. The BFF's trusted
 * headers are stripped so this route can never carry an org key or role.
 *
 * Mounted at `/api/v1/integrations/webhooks`, so Express has already removed
 * that prefix from `req.url` by the time the proxy rewrites the path.
 */
export function createWebhookProxy(platformApiOrigin: string): RequestHandler {
	return createProxyMiddleware({
		target: platformApiOrigin,
		changeOrigin: true,
		pathRewrite: (path) => `/v1/integrations/webhooks${path}`,
		on: {
			proxyReq: (proxyReq, req) => {
				for (const header of TRUSTED_HEADERS) proxyReq.removeHeader(header);
				forwardClientAddress(proxyReq, req as Request);
			},
		},
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
				const meshify = (req as Request).meshify;
				if (meshify?.apiKey) proxyReq.setHeader('Authorization', `Bearer ${meshify.apiKey}`);
				// Trusted org role and user id for platform-api's RBAC and per-user
				// rate limits. setHeader OVERWRITES any value the browser tried to
				// send, so a member can't forge 'admin' or someone else's identity.
				proxyReq.setHeader('X-Meshify-Org-Role', meshify?.orgRole ?? 'member');
				if (meshify?.userId) proxyReq.setHeader('X-Meshify-User-Id', meshify.userId);
				else proxyReq.removeHeader('X-Meshify-User-Id');
				forwardClientAddress(proxyReq, req as Request);
			},
		},
	});
}
