import express, { Router } from 'express';
import { pinoHttp } from 'pino-http';
import pg from 'pg';
import { clerkMiddleware } from '@clerk/express';
import { loadEnv } from '@meshify/config';
import { createLogger } from '@meshify/shared';
import { requireClerkSession } from './modules/auth/clerk-guard.js';
import { resolveOrgForClerk } from './modules/auth/resolve-org-for-clerk.js';
import { createHealthProxy, createPlatformApiProxy } from './modules/proxy/platform-proxy.js';

/** Fields the shared env schema marks optional (other apps don't need them) but this app requires. */
function requireBffEnv(env: ReturnType<typeof loadEnv>) {
	const missing = (
		[
			['CLERK_SECRET_KEY', env.CLERK_SECRET_KEY],
			['CLERK_PUBLISHABLE_KEY', env.CLERK_PUBLISHABLE_KEY],
			['ORG_KEY_ENCRYPTION_KEY', env.ORG_KEY_ENCRYPTION_KEY],
			['PLATFORM_API_ORIGIN', env.PLATFORM_API_ORIGIN],
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
	};
}

async function bootstrap(): Promise<void> {
	const env = loadEnv();
	const bff = requireBffEnv(env);
	const logger = createLogger({ level: env.PLATFORM_LOG_LEVEL, service: 'bff' });

	const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL });

	const app = express();
	app.use(pinoHttp({ logger }));
	app.use(
		clerkMiddleware({
			secretKey: bff.clerkSecretKey,
			publishableKey: bff.clerkPublishableKey,
		})
	);

	// Public: mirrors platform-api's own unauthenticated health/readiness route.
	app.get('/api/health', createHealthProxy(bff.platformApiOrigin));

	// Everything else requires a Clerk session, resolved to a Meshify org + API
	// key (auto-provisioning on first sign-in — see resolveOrgForClerk), then
	// streamed straight through to platform-api. No express.json()/multer here:
	// this must stay a raw passthrough so multipart uploads aren't buffered.
	const protectedRouter = Router();
	protectedRouter.use(requireClerkSession());
	protectedRouter.use(resolveOrgForClerk({ pool: pgPool, pepper: env.PLATFORM_API_KEY_PEPPER, encryptionKey: bff.orgKeyEncryptionKey, logger }));
	protectedRouter.use(createPlatformApiProxy(bff.platformApiOrigin));
	app.use('/api/v1', protectedRouter);

	const server = app.listen(env.BFF_PORT, () => {
		logger.info({ port: env.BFF_PORT }, 'bff listening');
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
