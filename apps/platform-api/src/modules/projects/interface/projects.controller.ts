import { Router } from 'express';
import type { CreateProjectUseCase } from '../application/create-project.usecase.js';
import { OrgNotFoundError } from '../application/create-project.usecase.js';
import type { DeleteProjectUseCase } from '../application/delete-project.usecase.js';
import { ProjectNotFoundError } from '../application/delete-project.usecase.js';
import type { GetProjectUseCase } from '../application/get-project.usecase.js';
import type { GetProjectStatsUseCase } from '../application/get-project-stats.usecase.js';
import type { ListProjectsUseCase } from '../application/list-projects.usecase.js';
import { createProjectSchema } from './dto.js';
import { projectIsolationGuard } from './project-isolation.guard.js';
import type { Project } from '@meshify/data-access';

function toResponse(project: Project) {
	return {
		id: project.id,
		orgId: project.orgId,
		name: project.name,
		description: project.description,
		status: project.status,
		llmProfile: project.llmProfile,
		embeddingProfile: project.embeddingProfile,
		createdAt: project.createdAt.toISOString(),
		updatedAt: project.updatedAt.toISOString(),
	};
}

export function createProjectsController(deps: {
	createProject: CreateProjectUseCase;
	deleteProject: DeleteProjectUseCase;
	getProject: GetProjectUseCase;
	getProjectStats: GetProjectStatsUseCase;
	listProjects: ListProjectsUseCase;
}): Router {
	const router = Router();

	router.get('/v1/projects', async (req, res) => {
		const projects = await deps.listProjects.execute(req.auth!.orgId);
		res.status(200).json(projects.map(toResponse));
	});

	router.post('/v1/projects', async (req, res) => {
		const parsed = createProjectSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}

		try {
			const project = await deps.createProject.execute({ ...parsed.data, orgId: req.auth!.orgId });
			res.status(201).json(toResponse(project));
		} catch (err) {
			if (err instanceof OrgNotFoundError) {
				res.status(400).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'failed to create project');
			res.status(502).json({ error: 'Failed to provision project — see server logs' });
		}
	});

	router.get('/v1/projects/:projectId', projectIsolationGuard(deps.getProject), (req, res) => {
		res.status(200).json(toResponse(req.project!));
	});

	// Real aggregate counts (repositories, documents, conversations, coverage) for Project Home.
	router.get('/v1/projects/:projectId/stats', projectIsolationGuard(deps.getProject), async (req, res) => {
		const stats = await deps.getProjectStats.execute(req.project!.id);
		res.status(200).json(stats);
	});

	router.delete('/v1/projects/:projectId', projectIsolationGuard(deps.getProject), async (req, res) => {
		try {
			await deps.deleteProject.execute(req.project!.id);
			res.status(204).send();
		} catch (err) {
			if (err instanceof ProjectNotFoundError) {
				res.status(404).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'failed to delete project');
			res.status(502).json({ error: 'Failed to delete project — see server logs' });
		}
	});

	return router;
}
