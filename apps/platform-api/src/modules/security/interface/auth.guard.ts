import type { NextFunction, Request, Response } from 'express';
import type { AuthContext } from '@meshify/data-access';
import { ACTOR_ASSERTION_HEADER } from '@meshify/shared';
import { AuthenticateApiKeyUseCase, AuthenticationError, NotAMemberError } from '../application/authenticate.usecase.js';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			auth?: AuthContext;
		}
	}
}

/**
 * Requires a valid API key on every request it guards and attaches the
 * resolved org context to `req.auth`. Mount this before any project/data route
 * so downstream guards can trust `req.auth.orgId`. Returns 401 with a
 * `WWW-Authenticate` challenge and no detail about why the key failed.
 */
export function authGuard(authenticate: AuthenticateApiKeyUseCase) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			// Every identity header is set authoritatively by the BFF (browsers cannot
			// forge them - they never hold the org key and the BFF overwrites the
			// headers). The signed assertion supersedes the legacy role header.
			req.auth = await authenticate.execute({
				authorization: req.header('authorization'),
				assertion: req.header(ACTOR_ASSERTION_HEADER),
				orgRole: req.header('x-meshify-org-role'),
				actorId: req.header('x-meshify-user-id'),
			});
			next();
		} catch (err) {
			if (err instanceof AuthenticationError) {
				res.setHeader('WWW-Authenticate', 'Bearer');
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}
			if (err instanceof NotAMemberError) {
				res.status(403).json({ error: 'You are not an active member of this organization', code: 'not_a_member' });
				return;
			}
			req.log?.error({ err }, 'authentication failed unexpectedly');
			res.status(500).json({ error: 'Internal error' });
		}
	};
}
