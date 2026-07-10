import { Router } from 'express';
import { z } from 'zod';
import { MissingEmbeddingKeyError, UnsupportedEmbeddingProfileError } from '@meshify/embeddings';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import type { SearchUseCase } from '../application/search.usecase.js';

const searchSchema = z.object({
	query: z.string().min(1).max(2000),
	mode: z.enum(['semantic', 'keyword', 'hybrid']).default('semantic'),
	scope: z.enum(['all', 'documents', 'code']).default('all'),
	limit: z.number().int().positive().max(50).optional(),
	filters: z
		.object({
			language: z.string().min(1).optional(),
			parentType: z.enum(['document', 'file']).optional(),
			sourcePathPrefix: z.string().min(1).optional(),
		})
		.optional(),
});

export function createSearchController(deps: { getProject: GetProjectUseCase; search: SearchUseCase }): Router {
	const router = Router();
	const guard = projectIsolationGuard(deps.getProject);

	router.post('/v1/projects/:projectId/search', guard, async (req, res) => {
		const parsed = searchSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}

		try {
			const result = await deps.search.execute({
				project: req.project!,
				query: parsed.data.query,
				mode: parsed.data.mode,
				scope: parsed.data.scope,
				limit: parsed.data.limit,
				filters: parsed.data.filters,
			});
			res.status(200).json(result);
		} catch (err) {
			// A project whose embedding model we can't reproduce for queries is a
			// configuration problem, reported clearly rather than as a 500.
			if (err instanceof MissingEmbeddingKeyError || err instanceof UnsupportedEmbeddingProfileError) {
				res.status(422).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'search failed');
			res.status(502).json({ error: 'Search is temporarily unavailable — the embedding or vector service could not be reached' });
		}
	});

	return router;
}
