import type { NextFunction, Request, Response } from 'express';
import type { AuditLogRepository } from '@meshify/data-access';

const NON_MUTATING = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Records an audit entry for every mutating (non-GET) authenticated request,
 * once the response status is known. Mount AFTER authGuard (needs `req.auth`)
 * and BEFORE the routes (so it's registered around them); it reads `req.project`
 * lazily at response-finish time, by which point the isolation guard has set it.
 *
 * Auditing must never affect the response: it writes on the `finish` event,
 * off the request's critical path, and swallows its own errors.
 */
export function auditLogMiddleware(audit: AuditLogRepository) {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (NON_MUTATING.has(req.method)) {
			next();
			return;
		}

		res.on('finish', () => {
			const auth = req.auth;
			if (!auth) return; // unauthenticated paths (e.g. health) aren't audited here

			const projectId = req.project?.id ?? (typeof req.params.projectId === 'string' ? req.params.projectId : null);

			void audit
				.record({
					orgId: auth.orgId,
					projectId,
					actorKeyId: auth.keyId,
					action: `${req.method} ${req.route?.path ?? req.path}`,
					resourceType: resourceTypeFrom(req.path),
					resourceId: projectId ?? req.path,
					ipAddress: clientIp(req),
					metadata: { status: res.statusCode, path: req.originalUrl },
				})
				.catch((err) => req.log?.error({ err }, 'failed to write audit log'));
		});

		next();
	};
}

/** The resource collection from a `/v1/<resource>/...` path, for grouping in queries. */
function resourceTypeFrom(path: string): string {
	const segments = path.split('/').filter(Boolean);
	return segments[0] === 'v1' ? (segments[1] ?? 'unknown') : (segments[0] ?? 'unknown');
}

function clientIp(req: Request): string | null {
	// Express `req.ip` honours trust proxy config; fall back to the socket.
	return req.ip ?? req.socket.remoteAddress ?? null;
}
