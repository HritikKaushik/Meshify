import type { NextFunction, Request, Response } from 'express';
import type { AuthContext } from '@meshify/data-access';
import { AuthenticateApiKeyUseCase, AuthenticationError } from '../application/authenticate.usecase.js';

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
			req.auth = await authenticate.execute(req.header('authorization'));
			next();
		} catch (err) {
			if (err instanceof AuthenticationError) {
				res.setHeader('WWW-Authenticate', 'Bearer');
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}
			req.log?.error({ err }, 'authentication failed unexpectedly');
			res.status(500).json({ error: 'Internal error' });
		}
	};
}
