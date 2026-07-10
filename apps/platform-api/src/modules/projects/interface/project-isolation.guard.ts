import type { NextFunction, Request, Response } from 'express';
import type { Project } from '../domain/project.entity.js';
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
 */
export function projectIsolationGuard(getProject: GetProjectUseCase) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : undefined;
		if (!projectId) {
			res.status(400).json({ error: 'projectId route parameter is required' });
			return;
		}

		const project = await getProject.execute(projectId);
		if (!project) {
			res.status(404).json({ error: `Project "${projectId}" not found` });
			return;
		}

		req.project = project;
		next();
	};
}
