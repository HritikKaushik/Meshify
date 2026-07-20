import { z } from 'zod';

/**
 * Single source of truth for runtime configuration. Validated once at process
 * boot in every app/worker entrypoint via `loadEnv()` — never read `process.env`
 * directly outside this module.
 */
const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

	// Platform API
	PLATFORM_PORT: z.coerce.number().int().positive().default(3000),
	// Also read by apps/bff when auto-provisioning API keys for new Clerk orgs —
	// must be the SAME value in both processes, or platform-api can never verify
	// a key the BFF minted.
	PLATFORM_API_KEY_PEPPER: z.string().min(16, 'PLATFORM_API_KEY_PEPPER must be at least 16 chars'),
	PLATFORM_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

	// BFF (Clerk session proxy — apps/bff). Optional here so platform-api/worker
	// aren't forced to set them; apps/bff validates its own required-ness at boot.
	BFF_PORT: z.coerce.number().int().positive().default(3001),
	PLATFORM_API_ORIGIN: z.string().url().optional(),
	CLERK_SECRET_KEY: z.string().optional(),
	CLERK_PUBLISHABLE_KEY: z.string().optional(),
	ORG_KEY_ENCRYPTION_KEY: z.string().min(32, 'ORG_KEY_ENCRYPTION_KEY must be at least 32 chars').optional(),

	// Rate limiting (fixed-window per API key, backed by Redis). Defaults suit a
	// modest single-tenant deployment; raise for higher-throughput clients.
	RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
	RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),

	// Postgres
	DATABASE_URL: z.string().url(),

	// Redis / BullMQ
	REDIS_URL: z.string().url(),

	// Qdrant
	QDRANT_URL: z.string().url(),
	QDRANT_API_KEY: z.string().optional(),

	// S3-compatible object storage (MinIO locally, S3/R2/Spaces in prod)
	S3_ENDPOINT: z.string().url(),
	S3_REGION: z.string().default('us-east-1'),
	S3_BUCKET: z.string().min(1),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
	S3_FORCE_PATH_STYLE: z
		.enum(['true', 'false'])
		.default('true')
		.transform((v) => v === 'true'),

	// RocketRide — only ever read inside packages/rocketride-gateway
	ROCKETRIDE_URI: z.string().url(),
	ROCKETRIDE_APIKEY: z.string().min(1),

	// Provider embedding keys. RocketRide substitutes these into ingest pipelines;
	// the search path also reads ROCKETRIDE_OPENAI_KEY directly to embed queries
	// with the same model used at ingest. Optional so non-search deployments still boot.
	ROCKETRIDE_OPENAI_KEY: z.string().optional(),
	ROCKETRIDE_GEMINI_KEY: z.string().optional(),

	// Meshify's managed GitHub App (set once per deployment by the operator —
	// never by customers; orgs connect via the provider platform's install
	// flow). Optional so non-GitHub deployments still boot; the github provider
	// reports "not configured" (503) at runtime when unset.
	GITHUB_APP_ID: z.string().optional(),
	GITHUB_APP_PRIVATE_KEY: z.string().optional(),
	GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
	// App slug (github.com/apps/<slug>) — builds the installation URL for Connect GitHub.
	GITHUB_APP_SLUG: z.string().optional(),
	// GitHub App user-authorization OAuth — REQUIRED for secure connect: verifies
	// the connecting user actually controls the installation (enable "Request user
	// authorization (OAuth) during installation" on the App). Without these the
	// github provider reports "not configured" and refuses to connect.
	GITHUB_APP_CLIENT_ID: z.string().optional(),
	GITHUB_APP_CLIENT_SECRET: z.string().optional(),

	// Encrypts integration credentials at rest (the CredentialVault's key).
	// Falls back to ORG_KEY_ENCRYPTION_KEY so existing deployments need no new
	// config; set it separately to decouple rotation of the two domains.
	INTEGRATION_ENCRYPTION_KEY: z.string().min(32).optional(),

	// Slack connector (conversation ingestion). Optional so non-Slack deployments
	// still boot; the Slack use cases validate presence at runtime. OAuth `state`
	// signing + access-token encryption reuse ORG_KEY_ENCRYPTION_KEY.
	// SLACK_REDIRECT_URI must be a static URL registered on the Slack app that
	// points at the web app's /oauth/slack/callback route.
	SLACK_CLIENT_ID: z.string().optional(),
	SLACK_CLIENT_SECRET: z.string().optional(),
	SLACK_REDIRECT_URI: z.string().url().optional(),
	// Reserved for a future Slack Events API receiver (request signature check); unused by history-timestamp sync.
	SLACK_SIGNING_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Parses and validates process.env. Throws with a readable, field-by-field
 * message on failure so misconfiguration fails at boot, not on first request.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
	if (cached) return cached;

	const result = envSchema.safeParse(source);
	if (!result.success) {
		const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
		throw new Error(`Invalid environment configuration:\n${issues}`);
	}

	cached = result.data;
	return cached;
}

/** Test-only helper to reset the cached env between test cases. */
export function resetEnvCache(): void {
	cached = undefined;
}
