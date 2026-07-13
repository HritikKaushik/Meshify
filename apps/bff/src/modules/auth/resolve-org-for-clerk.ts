import type { NextFunction, Request, Response } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import type pg from 'pg';
import { PostgresClerkOrgLinkRepository, provisionOrgForClerk } from '@meshify/data-access';
import type { Logger } from '@meshify/shared';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			meshify?: { meshifyOrgId: string; apiKey: string };
		}
	}
}

export interface ResolveOrgForClerkDeps {
	pool: pg.Pool;
	pepper: string;
	encryptionKey: string;
	logger: Logger;
}

/**
 * Resolves the authenticated Clerk session's organization to a Meshify
 * org + API key, attaching it to `req.meshify`. On the very first request
 * from a Clerk organization that hasn't been seen before, auto-provisions a
 * Meshify org + API key inline (see provisionOrgForClerk) — no operator step.
 *
 * Requires Clerk Organizations to be enabled (so req.auth.orgId is populated).
 * A session with no org context (personal account, no org selected) 400s with
 * a message pointing at that requirement rather than silently proceeding with
 * no tenant context.
 */
export function resolveOrgForClerk(deps: ResolveOrgForClerkDeps) {
	const links = new PostgresClerkOrgLinkRepository(deps.pool, deps.encryptionKey);

	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const auth = getAuth(req);
		const clerkOrgId = auth.orgId;
		if (!clerkOrgId) {
			res.status(400).json({
				error: 'No active organization on this session. Enable Clerk Organizations and select/create one before calling the API.',
			});
			return;
		}

		try {
			const existing = await links.findByClerkOrgId(clerkOrgId);
			if (existing) {
				req.meshify = { meshifyOrgId: existing.orgId, apiKey: existing.apiKeyPlaintext };
				next();
				return;
			}

			const clerkOrg = await clerkClient.organizations.getOrganization({ organizationId: clerkOrgId });
			const link = await provisionOrgForClerk({
				clerkOrgId,
				orgName: clerkOrg.name,
				pool: deps.pool,
				pepper: deps.pepper,
				encryptionKey: deps.encryptionKey,
			});
			deps.logger.info({ clerkOrgId, meshifyOrgId: link.orgId }, 'auto-provisioned Meshify org for new Clerk organization');
			req.meshify = { meshifyOrgId: link.orgId, apiKey: link.apiKeyPlaintext };
			next();
		} catch (err) {
			deps.logger.error({ err, clerkOrgId }, 'failed to resolve/provision Meshify org for Clerk session');
			res.status(502).json({ error: 'Failed to resolve organization — see server logs' });
		}
	};
}
