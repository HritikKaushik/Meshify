import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';

/**
 * Requires a valid Clerk session. Unlike platform-api's authGuard (API-key
 * bearer), this checks the session Clerk's own clerkMiddleware() already
 * attached to req.auth — mount clerkMiddleware() globally before this.
 */
export function requireClerkSession() {
	return (req: Request, res: Response, next: NextFunction): void => {
		const auth = getAuth(req);
		if (!auth.userId) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}
		next();
	};
}
