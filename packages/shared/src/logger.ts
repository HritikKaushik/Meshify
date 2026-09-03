import pino from 'pino';

export interface LoggerOptions {
	level: string;
	/** Service name stamped on every log line (e.g. "platform-api", "worker"). */
	service: string;
}

/**
 * Key names under which a secret can appear in a logged object. Pino's `*`
 * matches exactly one level, so each name is listed at depths 1-3: `{ apikey }`,
 * `{ config: { apikey } }` (a RocketRide pipeline node carries a BYOA provider key
 * under `apikey`), and `{ err: { config: { headers: { authorization } } } }` (an
 * HTTP client error wrapping its request). Keep this list in step with the env
 * schema and the vault: a key that is not here is one incident from the logs.
 */
const SECRET_KEYS = [
	'authorization',
	'cookie',
	'apikey',
	'apiKey',
	'api_key',
	'secret',
	'password',
	'passphrase',
	'token',
	'accessToken',
	'refreshToken',
	'access_token',
	'refresh_token',
	'privateKey',
	'private_key',
	'clientSecret',
	'client_secret',
	'encrypted_value',
	'encryptedValue',
	'key_hash',
	'app_private_key',
	'app_client_secret',
	'app_signing_secret',
	'app_webhook_secret',
];

export const REDACT_PATHS = [
	'req.headers.authorization',
	'req.headers.cookie',
	'res.headers["set-cookie"]',
	// A bare name covers the top level; `*` in pino matches exactly one level.
	...SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`]),
];

export function createLogger(options: LoggerOptions) {
	return pino({
		level: options.level,
		base: { service: options.service },
		// Credentials must never reach the logs. pino-http serializes request/
		// response headers, which carry the Authorization API key (platform-api)
		// and the Clerk session cookie (bff); mask them wherever they appear.
		// The wildcard paths defensively mask provider/registration secrets and
		// tokens if an object carrying them is ever logged accidentally.
		redact: {
			paths: REDACT_PATHS,
			censor: '[redacted]',
		},
	});
}

export type Logger = ReturnType<typeof createLogger>;
