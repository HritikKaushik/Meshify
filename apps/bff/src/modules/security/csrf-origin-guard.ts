import type { RequestHandler } from 'express';

/**
 * CSRF defense for a cookie-authenticated proxy.
 *
 * The BFF authenticates the browser with a Clerk session cookie sent
 * automatically on every request, which is exactly what a cross-site request
 * forgery abuses. Clerk's cookie is `SameSite=Lax`, which already blocks the
 * classic top-level cross-site POST, but we don't want the whole platform's
 * CSRF posture to rest on one framework default — so this adds an explicit,
 * independent check.
 *
 * For state-changing methods, the request's `Origin` (or, as a fallback, the
 * origin parsed from `Referer`) MUST be one of the trusted app origins.
 * Browsers always attach `Origin` to POST/PUT/PATCH/DELETE, so a genuine
 * request from the app always passes; a forged request from evil.example.com
 * carries that origin (or is a `SameSite` no-op) and is rejected with 403.
 *
 * Safe methods (GET/HEAD/OPTIONS) are never gated — they don't mutate state,
 * and gating them would break same-origin GETs that omit `Origin`.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url).origin;
	} catch {
		return undefined;
	}
}

export function csrfOriginGuard(allowedOrigins: readonly string[]): RequestHandler {
	const allow = new Set(allowedOrigins);
	return (req, res, next) => {
		if (SAFE_METHODS.has(req.method)) {
			next();
			return;
		}

		// `Origin` is the authoritative signal; `Referer` is a defensive fallback
		// for the rare client that omits Origin but sends Referer.
		const requestOrigin = req.get('origin') ?? originOf(req.get('referer'));

		if (!requestOrigin || !allow.has(requestOrigin)) {
			res.status(403).json({ error: 'csrf_origin_rejected' });
			return;
		}

		next();
	};
}
