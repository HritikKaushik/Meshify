import type { NextFunction, Request, Response } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import type pg from 'pg';
import { PostgresClerkOrgLinkRepository, provisionOrgForClerk } from '@meshify/data-access';
import { signActorAssertion, type Logger } from '@meshify/shared';
import type { MemberResolver } from './member-resolver.js';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			meshify?: {
				meshifyOrgId: string;
				apiKey: string;
				orgRole: 'admin' | 'member';
				/** The Clerk user id. */
				userId: string;
				/** Signed statement of who this request acts for; absent while no secret is configured. */
				actorAssertion?: string;
			};
		}
	}
}

/**
 * Maps a Clerk session org role to Meshify's coarse admin/member. Clerk's
 * built-in admin role is `org:admin`; every other role (including `org:member`
 * and any custom role) is treated as a non-admin member. The proxy forwards
 * this to platform-api, which gates org-admin actions on it.
 */
function toMeshifyRole(clerkOrgRole: string | null | undefined): 'admin' | 'member' {
	return clerkOrgRole === 'org:admin' ? 'admin' : 'member';
}

export interface ResolveOrgForClerkDeps {
	pool: pg.Pool;
	pepper: string;
	encryptionKey: string;
	logger: Logger;
	members: MemberResolver;
	/** `BFF_ASSERTION_SECRET`. Unset: people are still mirrored into Postgres, but no assertion is sent. */
	assertionSecret: string | undefined;
	/** In `required` mode a request that cannot be attributed to a member is refused rather than sent on the legacy headers. */
	assertionMode: 'permissive' | 'required';
}

/**
 * Resolves the authenticated Clerk session's organization to a Meshify
 * org + API key, attaching it to `req.meshify`. On the very first request
 * from a Clerk organization that hasn't been seen before, auto-provisions a
 * Meshify org + API key inline (see provisionOrgForClerk) — no operator step.
 *
 * It then mirrors the signed-in person into Postgres (see MemberResolver) and
 * signs the identity assertion platform-api resolves their role from.
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
		const orgRole = toMeshifyRole(auth.orgRole);

		let link;
		try {
			link = await links.findByClerkOrgId(clerkOrgId);
			if (!link) {
				const clerkOrg = await clerkClient.organizations.getOrganization({ organizationId: clerkOrgId });
				link = await provisionOrgForClerk({
					clerkOrgId,
					orgName: clerkOrg.name,
					pool: deps.pool,
					pepper: deps.pepper,
					encryptionKey: deps.encryptionKey,
				});
				deps.logger.info({ clerkOrgId, meshifyOrgId: link.orgId }, 'auto-provisioned Meshify org for new Clerk organization');
			}
		} catch (err) {
			deps.logger.error({ err, clerkOrgId }, 'failed to resolve/provision Meshify org for Clerk session');
			res.status(502).json({ error: 'Failed to resolve organization - see server logs' });
			return;
		}

		req.meshify = { meshifyOrgId: link.orgId, apiKey: link.apiKeyPlaintext, orgRole, userId: auth.userId };

		try {
			const member = await deps.members.resolve({ orgId: link.orgId, clerkOrgId, clerkUserId: auth.userId, clerkOrgRole: auth.orgRole });
			if (!member.ok) {
				res.status(403).json({ error: 'You are not an active member of this organization', code: 'not_a_member' });
				return;
			}
			if (deps.assertionSecret) req.meshify.actorAssertion = signActorAssertion(deps.assertionSecret, { sub: member.userId, org: link.orgId });
		} catch (err) {
			deps.logger.error({ err, clerkOrgId, clerkUserId: auth.userId }, 'failed to resolve the signed-in member');
			// During rollout platform-api still honours the legacy role header, so a
			// failure here must not take every signed-in request down with it.
			if (deps.assertionMode === 'required') {
				res.status(502).json({ error: 'Failed to resolve your membership - see server logs' });
				return;
			}
		}
		next();
	};
}
