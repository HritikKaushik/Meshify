import type { RequestHandler } from 'express';
import { z } from 'zod';

const uuid = z.string().uuid();

/**
 * Rejects a request with 400 if any named route param isn't a UUID. Mount before
 * a handler that treats a `:id`-style param as an entity id, so malformed input
 * is refused early with a clear message instead of reaching Postgres — where a
 * non-UUID compared against a `uuid` column raises "invalid input syntax" and
 * surfaces as an opaque 500.
 */
export function requireUuidParams(...names: string[]): RequestHandler {
	return (req, res, next) => {
		for (const name of names) {
			if (!uuid.safeParse(req.params[name]).success) {
				res.status(400).json({ error: `Invalid "${name}" — expected a UUID` });
				return;
			}
		}
		next();
	};
}
