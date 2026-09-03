import '@meshify/telemetry'; // MUST be first — instruments http/express/pg before they load
import express, { Router } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { loadEnv } from '@meshify/config';
import { createPgPool } from '@meshify/data-access';
import { closeHttpServer, createLogger, installGracefulShutdown, installProcessGuards } from '@meshify/shared';
import { requireClerkSession } from './modules/auth/clerk-guard.js';
import { resolveOrgForClerk } from './modules/auth/resolve-org-for-clerk.js';
import { csrfOriginGuard } from './modules/security/csrf-origin-guard.js';
import { maxBodySize } from './modules/security/max-body-size.js';
import { createHealthProxy, createPlatformApiProxy, createWebhookProxy } from './modules/proxy/platform-proxy.js';

/** Fields the shared env schema marks optional (other apps don't need them) but this app requires. */
function requireBffEnv(env: ReturnType<typeof loadEnv>) {
	const isProd = env.NODE_ENV === 'production';

	// Trusted browser origins for the CSRF guard. Required in production (a wrong
	// or empty allowlist would either block the real app or weaken CSRF), but
	// defaults to the Vite dev origin locally so `pnpm dev` needs no extra config.
	const allowedOrigins = (env.APP_ORIGIN ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

	const missing = (
		[
			['CLERK_SECRET_KEY', env.CLERK_SECRET_KEY],
			['CLERK_PUBLISHABLE_KEY', env.CLERK_PUBLISHABLE_KEY],
			['ORG_KEY_ENCRYPTION_KEY', env.ORG_KEY_ENCRYPTION_KEY],
			['PLATFORM_API_ORIGIN', env.PLATFORM_API_ORIGIN],
			// Only mandatory in prod; dev falls back to the Vite origin below.
			['APP_ORIGIN', isProd ? (allowedOrigins.length > 0 ? 'set' : '') : 'dev-default'],
		] as const
	).filter(([, value]) => !value);

	if (missing.length > 0) {
		throw new Error(`Missing required BFF environment variables: ${missing.map(([name]) => name).join(', ')}`);
	}

	return {
		clerkSecretKey: env.CLERK_SECRET_KEY!,
		clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY!,
		orgKeyEncryptionKey: env.ORG_KEY_ENCRYPTION_KEY!,
		platformApiOrigin: env.PLATFORM_API_ORIGIN!,
		allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:5174'],
	};
}

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const bff = requireBffEnv(env);
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'bff' });
	installProcessGuards(logger);

	const pgPool = createPgPool({ connectionString: env.DATABASE_URL, max: env.PG_POOL_MAX, statementTimeoutMs: env.PG_STATEMENT_TIMEOUT_MS, applicationName: 'bff' }, logger);

	const app = express();
	// Client addresses (the pre-auth limiter, what we forward to platform-api)
	// come from X-Forwarded-For; trust exactly the configured hops in front of
	// this process (Render: web nginx + load balancer = 2).
	app.set('trust proxy', env.TRUST_PROXY_HOPS);
	app.use(pinoHttp({ logger }));

	// Security headers (defense-in-depth). The BFF serves API/proxy responses, not
	// HTML, so CSP is off (the SPA's CSP lives at the web/edge layer) and HSTS is
	// off (owned by the TLS-terminating edge — Cloudflare/nginx). Frameguard +
	// referrer-policy values match the web nginx so a browser sees one consistent
	// set even when both are in path (nginx also proxy_hide_header's these on /api).
	app.use(
		helmet({
			contentSecurityPolicy: false,
			strictTransportSecurity: false,
			frameguard: { action: 'deny' },
			referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
		})
	);

	// Local liveness — mounted BEFORE clerkMiddleware so it answers from this
	// process alone, with no Clerk or downstream dependency. An orchestrator thus
	// restarts the BFF only when the BFF itself is hung. Used by the HEALTHCHECK.
	app.get('/healthz', (_req, res) => {
		res.json({ status: 'ok' });
	});

	// Reject oversized uploads at the edge (matches the web nginx client_max_body_size
	// and platform-api's 50MB multer limit) before streaming anything downstream.
	app.use('/api/v1', maxBodySize(50 * 1024 * 1024));

	// Pre-auth address limiter: unauthenticated floods (or a scripted client with
	// no session) are cut off here, before they cost a Clerk session
	// verification or reach the public webhook passthrough. Generous - a real
	// user never gets near it - and per address, so it only ever bites one source.
	app.use(
		'/api/v1',
		rateLimit({
			windowMs: 60_000,
			limit: 1200,
			standardHeaders: 'draft-7',
			legacyHeaders: false,
			message: { error: 'Rate limit exceeded' },
		})
	);

	// Provider webhook deliveries: public, streamed through raw to platform-api,
	// which verifies the provider signature itself. Mounted BEFORE the CSRF
	// guard (server-to-server POSTs carry no Origin) and before Clerk.
	app.use('/api/v1/integrations/webhooks', createWebhookProxy(bff.platformApiOrigin));

	// CSRF guard runs BEFORE Clerk so a forged cross-origin write is rejected with
	// 403 without spending any auth work on it. Safe methods pass straight through.
	app.use('/api/v1', csrfOriginGuard(bff.allowedOrigins));

	app.use(
		clerkMiddleware({
			secretKey: bff.clerkSecretKey,
			publishableKey: bff.clerkPublishableKey,
		})
	);

	// Public readiness: proxies to platform-api's own unauthenticated health route,
	// so a 200 here means the BFF can actually reach the core API.
	app.get('/api/health', createHealthProxy(bff.platformApiOrigin));

	// Everything else requires a Clerk session, resolved to a Meshify org + API
	// key (auto-provisioning on first sign-in — see resolveOrgForClerk), then
	// streamed straight through to platform-api. No express.json()/multer here:
	// this must stay a raw passthrough so multipart uploads aren't buffered.
	// Per-user edge rate limit, keyed by the Clerk user id (mounted AFTER
	// requireClerkSession, so the key is always the authenticated user). The
	// store is per process; the authoritative per-user and per-org limits live in
	// platform-api on Redis, so this is only a local backstop and needs no
	// shared store when the BFF scales out.
	const edgeRateLimit = rateLimit({
		windowMs: 60_000,
		limit: 600,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		keyGenerator: (req) => getAuth(req).userId ?? 'anonymous',
		message: { error: 'Rate limit exceeded' },
	});

	const protectedRouter = Router();
	protectedRouter.use(requireClerkSession());
	protectedRouter.use(edgeRateLimit);
	protectedRouter.use(resolveOrgForClerk({ pool: pgPool, pepper: env.PLATFORM_API_KEY_PEPPER, encryptionKey: bff.orgKeyEncryptionKey, logger }));
	protectedRouter.use(createPlatformApiProxy(bff.platformApiOrigin));
	app.use('/api/v1', protectedRouter);

	// Railway (and similar PaaS) inject the port to bind as $PORT and probe the
	// healthcheck there; honor it when present, else the configured BFF_PORT.
	const port = Number(process.env.PORT) || env.BFF_PORT;
	// Bind :: (all IPv6, dual-stack — also accepts IPv4) rather than the default.
	// Railway's private network is IPv6-only: a service bound to 0.0.0.0 answers the
	// loopback healthcheck (so it shows "Online") but is unreachable at
	// <name>.railway.internal, which makes the web nginx return 502 for /api.
	const server = app.listen(port, '::', () => {
		logger.info({ port }, 'bff listening');
	});

	// Drain in-flight proxied requests (uploads, SSE) before closing, bounded
	// below Render's 30s shutdown grace for this service.
	installGracefulShutdown({
		logger,
		timeoutMs: 25_000,
		steps: [
			{ name: 'http server', run: () => closeHttpServer(server, { drainMs: 15_000 }) },
			{ name: 'postgres', run: () => pgPool.end() },
		],
	});
}

bootstrap().catch((err) => {
	console.error('Fatal error during bootstrap:', err);
	process.exit(1);
});