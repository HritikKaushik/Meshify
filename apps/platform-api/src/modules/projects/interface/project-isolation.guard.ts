import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { Project } from '@meshify/data-access';
import type { GetProjectUseCase } from '../application/get-project.usecase.js';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			project?: Project;
		}
	}
}

/**
 * Resolves `:projectId` from the route, 404s if it doesn't exist or is
 * deleted, and attaches the loaded Project to `req.project`. Every module
 * that scopes data by project MUST read `req.project.id` — never trust a
 * `projectId` taken from the request body or query string, which would
 * allow a caller to bypass isolation by mismatching the two.
 *
 * Cross-org isolation: a project owned by a different org than the
 * authenticated key is treated as NOT FOUND (404, not 403) so a caller cannot
 * probe which project ids exist across tenant boundaries. Requires authGuard
 * to have run first (`req.auth`).
 */
const UUID = z.string().uuid();

export function projectIsolationGuard(getProject: GetProjectUseCase) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		if (!req.auth) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}

		const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : undefined;
		if (!projectId) {
			res.status(400).json({ error: 'projectId route parameter is required' });
			return;
		}
		// Refuse malformed ids before they reach Postgres: compared against a uuid
		// column they raise "invalid input syntax", and an error thrown from an
		// async middleware used to escape Express 4 entirely and kill the process.
		if (!UUID.safeParse(projectId).success) {
			res.status(400).json({ error: 'Invalid "projectId" — expected a UUID' });
			return;
		}

		try {
			const project = await getProject.execute(projectId);
			if (!project || project.orgId !== req.auth.orgId) {
				res.status(404).json({ error: `Project "${projectId}" not found` });
				return;
			}
			req.project = project;
			next();
		} catch (err) {
			// Hand infrastructure failures to the terminal error middleware (500 JSON)
			// rather than letting the rejection escape.
			next(err);
		}
	};
}
