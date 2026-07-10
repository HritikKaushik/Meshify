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
	PLATFORM_API_KEY_PEPPER: z.string().min(16, 'PLATFORM_API_KEY_PEPPER must be at least 16 chars'),
	PLATFORM_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

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

	// GitHub App (repo ingestion)
	GITHUB_APP_ID: z.string().min(1),
	GITHUB_APP_PRIVATE_KEY: z.string().min(1),
	GITHUB_APP_WEBHOOK_SECRET: z.string().min(1),
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
