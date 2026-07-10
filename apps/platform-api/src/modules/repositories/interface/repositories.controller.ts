import { Router } from 'express';
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const connectGitHubSchema = z.object({
	source: z.literal('github'),
	remoteUrl: z.string().url(),
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
	uploadZip: UploadRepositoryZipUseCase;
	syncRepository: SyncRepositoryUseCase;
	listRepositories: ListRepositoriesUseCase;
}): Router {
	const router = Router();
	const guard = projectIsolationGuard(deps.getProject);

	// One route, two intake modes: multipart = ZIP upload, JSON = GitHub connect.
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

			const parsed = connectGitHubSchema.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json({
					error: 'Send either multipart field "file" (ZIP) or JSON {source:"github", remoteUrl}',
					details: parsed.error.flatten(),
				});
				return;
			}

			const result = await deps.connectGitHub.execute({ projectId: req.project!.id, remoteUrl: parsed.data.remoteUrl });
			res.status(202).json({ repository: toResponse(result.repository), jobId: result.jobId });
		} catch (err) {
			res.status(400).json({ error: err instanceof Error ? err.message : 'Repository intake failed' });
		}
	});

	router.get('/v1/projects/:projectId/repositories', guard, async (req, res) => {
		const repositories = await deps.listRepositories.execute(req.project!.id);
		res.status(200).json({ repositories: repositories.map(toResponse) });
	});

	router.post('/v1/projects/:projectId/repositories/:repositoryId/sync', guard, async (req, res) => {
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
