import type { RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects a state-changing request whose declared `Content-Length` exceeds
 * `maxBytes` with 413, BEFORE the streaming proxy forwards it. The BFF never
 * buffers bodies (multipart uploads pass through byte-for-byte), so this only
 * inspects the header — cheap, no buffering. A chunked request that omits
 * `Content-Length` isn't bounded here; the web-tier nginx `client_max_body_size`
 * and the CDN cap that case. Defense-in-depth for the BFF-direct path.
 */
export function maxBodySize(maxBytes: number): RequestHandler {
	return (req, res, next) => {
		if (SAFE_METHODS.has(req.method)) {
			next();
			return;
		}
		const declared = Number(req.get('content-length'));
		if (Number.isFinite(declared) && declared > maxBytes) {
			res.status(413).json({ error: 'Payload too large' });
			return;
		}
		next();
	};
}
