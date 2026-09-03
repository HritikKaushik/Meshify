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
	// Gates the Prometheus /metrics endpoint. Set in production and configure the
	// same bearer token on the scraper; unset leaves /metrics open (dev only).
	METRICS_TOKEN: z.string().optional(),
	// Port for the worker's own metrics/health HTTP server (the worker otherwise
	// has no HTTP surface). Scraped for queue-depth + process metrics.
	WORKER_METRICS_PORT: z.coerce.number().int().positive().default(9091),

	// BFF (Clerk session proxy — apps/bff). Optional here so platform-api/worker
	// aren't forced to set them; apps/bff validates its own required-ness at boot.
	BFF_PORT: z.coerce.number().int().positive().default(3001),
	// Where the BFF reaches platform-api. Accepts a full URL (http://platform-api:3000)
	// or a bare `host:port`, which is defaulted to http:// - that is the form a Render
	// Blueprint `fromService: hostport` reference yields, and Render can't prepend a
	// scheme itself. Private networks are plain HTTP, hence http (unlike S3_ENDPOINT).
	PLATFORM_API_ORIGIN: z
		.string()
		.min(1)
		.transform((v) => (/^https?:\/\//i.test(v) ? v : `http://${v}`))
		.pipe(z.string().url())
		.optional(),
	// Public origin(s) the browser loads the web app from — comma-separated for
	// multiple (e.g. app + marketing domains). The BFF's CSRF guard rejects any
	// state-changing request whose Origin/Referer isn't in this list. Optional in
	// the shared schema; apps/bff requires it in production and defaults to the
	// Vite dev origin (http://localhost:5174) otherwise.
	APP_ORIGIN: z.string().optional(),
	CLERK_SECRET_KEY: z.string().optional(),
	CLERK_PUBLISHABLE_KEY: z.string().optional(),
	ORG_KEY_ENCRYPTION_KEY: z.string().min(32, 'ORG_KEY_ENCRYPTION_KEY must be at least 32 chars').optional(),

	// Rate limiting (fixed window, backed by Redis). RATE_LIMIT_MAX applies per
	// end user (BFF traffic) or per API key (direct callers) each window;
	// RATE_LIMIT_KEY_MAX is the ceiling across every user sharing one API key
	// (an org's whole budget). Defaults suit a modest deployment; raise for
	// higher-throughput clients.
	RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
	RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_KEY_MAX: z.coerce.number().int().positive().default(1200),

	// Retention for the observability and audit tables, swept daily by the
	// worker's maintenance task. Pipeline run traces are bulky diagnostics;
	// audit logs are kept a year by default (tune to your compliance regime).
	PIPELINE_RUN_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
	AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

	// How many proxy hops in front of this process are trusted when reading the
	// client address from X-Forwarded-For (Express `trust proxy`). Count only
	// proxies that append their own entry: platform-api sits behind the BFF,
	// which overwrites the header with the address it resolved (1); the BFF on
	// Render sits behind the web nginx and Render's load balancer (2). Trusting
	// more hops than exist lets a client spoof its address; fewer reports the
	// proxy's address as the client.
	TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

	// Postgres
	DATABASE_URL: z.string().url(),

	// Redis / BullMQ
	REDIS_URL: z.string().url(),

	// Qdrant
	QDRANT_URL: z.string().url(),
	QDRANT_API_KEY: z.string().optional(),

	// S3-compatible object storage (MinIO locally, Backblaze B2/S3/Spaces in prod)
	// Backblaze's console shows the endpoint scheme-less (e.g. s3.us-east-005.backblazeb2.com),
	// so accept a bare host and default it to https:// before validating as a URL — a
	// scheme-less value would otherwise fail .url() and crash the app at boot.
	S3_ENDPOINT: z
		.string()
		.min(1)
		.transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
		.pipe(z.string().url()),
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
	// Per-op timeout (ms) for RocketRide pipeline lifecycle calls (use/restart).
	// use() is documented as "time-consuming" — a managed cloud engine provisioning
	// embeddings + a Qdrant connection can exceed a tight budget, surfacing as
	// "pipeline start/restart did not respond". Default 60s; raise for slow engines.
	ROCKETRIDE_OP_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

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

/**
 * Crypto secrets that must be high-entropy in production. The zod schema only
 * enforces LENGTH — a long placeholder like `change-me-to-a-random-32-char-string`
 * passes it — so this catches obviously-weak values before they protect real data.
 */
const PRODUCTION_STRONG_SECRETS = ['PLATFORM_API_KEY_PEPPER', 'ORG_KEY_ENCRYPTION_KEY', 'INTEGRATION_ENCRYPTION_KEY'] as const;

/** Substrings that mark a value as a template/dev placeholder, never a real secret. */
const PLACEHOLDER_MARKERS = ['change-me', 'changeme', 'replace_me', 'replace-me', 'your-', 'example', 'placeholder', 'local-', 'dev-', 'test-'];

function weaknessReason(value: string): string | undefined {
	const lower = value.toLowerCase();
	const marker = PLACEHOLDER_MARKERS.find((m) => lower.includes(m));
	if (marker) return `looks like a placeholder (contains "${marker}")`;
	// A real random 32-byte key (base64/hex) has many distinct characters; a
	// trivial value ("aaaa…", "0000…", a short word repeated) has very few.
	if (new Set(value).size < 10) return 'too few distinct characters to be a random key';
	return undefined;
}

/**
 * In production, reject weak/placeholder crypto secrets. These keys pepper API-key
 * hashes and encrypt every org's provider credentials — a guessable value makes
 * the whole vault brute-forceable, so failing at boot is far safer than running.
 */
function assertStrongProductionSecrets(env: Env): void {
	if (env.NODE_ENV !== 'production') return;
	const weak: string[] = [];
	for (const name of PRODUCTION_STRONG_SECRETS) {
		const value = env[name];
		if (!value) continue; // presence is enforced elsewhere (schema / per-app boot checks)
		const reason = weaknessReason(value);
		if (reason) weak.push(`  - ${name}: ${reason}`);
	}
	if (weak.length > 0) {
		throw new Error(
			`Weak secret(s) rejected in production (generate with \`openssl rand -base64 32\`):\n${weak.join('\n')}`
		);
	}
}

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

	assertStrongProductionSecrets(result.data);

	cached = result.data;
	return cached;
}

/** Test-only helper to reset the cached env between test cases. */
export function resetEnvCache(): void {
	cached = undefined;
}
