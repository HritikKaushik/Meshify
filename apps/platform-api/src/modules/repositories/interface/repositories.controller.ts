import type { Router } from 'express';
import { requireUuidParams } from '../../../http/require-uuid-params.js';
import { createRouter } from '../../../http/router.js';
import multer from 'multer';
import { z } from 'zod';
import type { Repository } from '@meshify/data-access';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import type { ConnectGitHubRepositoryUseCase } from '../application/connect-github-repository.usecase.js';
import type { UploadRepositoryZipUseCase } from '../application/upload-repository-zip.usecase.js';
import type { SyncRepositoryUseCase } from '../application/sync-repository.usecase.js';
import { RepositoryNotFoundError } from '../application/sync-repository.usecase.js';
import type { ListRepositoriesUseCase } from '../application/list-repositories.usecase.js';
import type { DeleteRepositoryUseCase } from '../application/delete-repository.usecase.js';
import type { ConnectRepositoryFromIntegrationUseCase } from '../application/connect-repository-from-integration.usecase.js';
import {
	GitHubIntegrationNotFoundError,
	RepositoryAlreadyConnectedError,
	ResourceNotAccessibleError,
} from '../application/connect-repository-from-integration.usecase.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const connectGitHubSchema = z.object({
	source: z.literal('github'),
	remoteUrl: z.string().url(),
});

// Provider-platform intake: bind a repository of the org's GitHub installation by stable id.
const connectFromIntegrationSchema = z.object({
	integrationId: z.string().uuid(),
	githubRepoId: z.string().min(1),
});

function toResponse(repository: Repository) {
	return {
		id: repository.id,
		projectId: repository.projectId,
		source: repository.source,
		remoteUrl: repository.remoteUrl,
		defaultBranch: repository.defaultBranch,
		lastSyncedCommit: repository.lastSyncedCommit,
		syncStatus: repository.syncStatus,
		createdAt: repository.createdAt.toISOString(),
		updatedAt: repository.updatedAt.toISOString(),
	};
}

export function createRepositoriesController(deps: {
	getProject: GetProjectUseCase;
	connectGitHub: ConnectGitHubRepositoryUseCase;
	connectFromIntegration: ConnectRepositoryFromIntegrationUseCase;
	uploadZip: UploadRepositoryZipUseCase;
	syncRepository: SyncRepositoryUseCase;
	listRepositories: ListRepositoriesUseCase;
	deleteRepository: DeleteRepositoryUseCase;
}): Router {
	const router = createRouter();
	const guard = projectIsolationGuard(deps.getProject);

	// One route, three intake modes: multipart = ZIP upload, JSON {integrationId,
	// githubRepoId} = picker connect via the org's installation, JSON
	// {source:'github', remoteUrl} = legacy URL paste (kept for back-compat).
	router.post('/v1/projects/:projectId/repositories', guard, upload.single('file'), async (req, res) => {
		try {
			if (req.file) {
				const result = await deps.uploadZip.execute({
					projectId: req.project!.id,
					filename: req.file.originalname,
					buffer: req.file.buffer,
				});
				res.status(202).json({ repository: toResponse(result.repository), jobId: result.jobId });
				return;
			}

			if (req.body && typeof req.body === 'object' && 'integrationId' in req.body) {
				const parsed = connectFromIntegrationSchema.safeParse(req.body);
				if (!parsed.success) {
					res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
					return;
				}
				const result = await deps.connectFromIntegration.execute({
					projectId: req.project!.id,
					orgId: req.auth!.orgId,
					integrationId: parsed.data.integrationId,
					githubRepoId: parsed.data.githubRepoId,
				});
				res.status(202).json({ repository: toResponse(result.repository), jobId: result.jobId });
				return;
			}

			const parsed = connectGitHubSchema.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json({
					error: 'Send multipart field "file" (ZIP), JSON {integrationId, githubRepoId}, or JSON {source:"github", remoteUrl}',
					details: parsed.error.flatten(),
				});
				return;
			}

			const result = await deps.connectGitHub.execute({ projectId: req.project!.id, remoteUrl: parsed.data.remoteUrl });
			res.status(202).json({ repository: toResponse(result.repository), jobId: result.jobId });
		} catch (err) {
			if (err instanceof GitHubIntegrationNotFoundError) {
				res.status(404).json({ error: err.message });
			} else if (err instanceof RepositoryAlreadyConnectedError) {
				res.status(409).json({ error: err.message });
			} else if (err instanceof ResourceNotAccessibleError) {
				res.status(400).json({ error: err.message });
			} else {
				res.status(400).json({ error: err instanceof Error ? err.message : 'Repository intake failed' });
			}
		}
	});

	router.get('/v1/projects/:projectId/repositories', guard, async (req, res) => {
		const repositories = await deps.listRepositories.execute(req.project!.id);
		res.status(200).json({ repositories: repositories.map(toResponse) });
	});

	// Disconnect a repository — purges its code vectors + archive, then deletes the row (files cascade).
	router.delete('/v1/projects/:projectId/repositories/:repositoryId', guard, requireUuidParams('repositoryId'), async (req, res) => {
		try {
			await deps.deleteRepository.execute({ project: req.project!, repositoryId: req.params.repositoryId as string });
			res.status(204).send();
		} catch (err) {
			if (err instanceof RepositoryNotFoundError) {
				res.status(404).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'failed to delete repository');
			res.status(502).json({ error: 'Failed to disconnect repository — see server logs' });
		}
	});

	router.post('/v1/projects/:projectId/repositories/:repositoryId/sync', guard, requireUuidParams('repositoryId'), async (req, res) => {
		try {
			const result = await deps.syncRepository.execute(req.project!.id, req.params.repositoryId as string);
			res.status(202).json(result);
		} catch (err) {
			if (err instanceof RepositoryNotFoundError) {
				res.status(404).json({ error: err.message });
				return;
			}
			res.status(400).json({ error: err instanceof Error ? err.message : 'Sync failed' });
		}
	});

	return router;
}
