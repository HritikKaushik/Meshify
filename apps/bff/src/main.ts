import '@meshify/telemetry'; // MUST be first — instruments http/express/pg before they load
import express, { Router } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import pg from 'pg';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import { requireClerkSession } from './modules/auth/clerk-guard.js';
import { resolveOrgForClerk } from './modules/auth/resolve-org-for-clerk.js';
import { csrfOriginGuard } from './modules/security/csrf-origin-guard.js';
import { maxBodySize } from './modules/security/max-body-size.js';
import { createHealthProxy, createPlatformApiProxy } from './modules/proxy/platform-proxy.js';

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

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });

	const app = express();
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
	// requireClerkSession, so the key is always the authenticated user — never a
	// spoofable IP). In-process store: fine for a single BFF instance; front
	// multiple replicas with a shared store (e.g. rate-limit-redis) when scaling.
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

	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'shutting down');
		server.close();
		await pgPool.end();
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
	console.error('Fatal error during bootstrap:', err);
	process.exit(1);
});