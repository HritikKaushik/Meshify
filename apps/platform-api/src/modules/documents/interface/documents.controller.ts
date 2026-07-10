import { Router } from 'express';
import multer from 'multer';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import type { UploadDocumentUseCase } from '../application/upload-document.usecase.js';
import type { GetJobStatusUseCase } from '../application/get-job-status.usecase.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function createDocumentsController(deps: { getProject: GetProjectUseCase; uploadDocument: UploadDocumentUseCase; getJobStatus: GetJobStatusUseCase }): Router {
	const router = Router();
	const guard = projectIsolationGuard(deps.getProject);

	router.post('/v1/projects/:projectId/documents', guard, upload.single('file'), async (req, res) => {
		if (!req.file) {
			res.status(400).json({ error: 'multipart field "file" is required' });
			return;
		}

		try {
			const result = await deps.uploadDocument.execute({
				projectId: req.project!.id,
				filename: req.file.originalname,
				mimeType: req.file.mimetype,
				buffer: req.file.buffer,
			});

			res.status(202).json({
				documentId: result.document.id,
				status: result.document.status,
				jobId: result.deduped ? undefined : result.jobId,
				deduped: result.deduped,
			});
		} catch (err) {
			res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
		}
	});

	router.get('/v1/jobs/:jobId', async (req, res) => {
		const job = await deps.getJobStatus.execute(req.params.jobId as string);
		if (!job) {
			res.status(404).json({ error: `Job "${req.params.jobId}" not found` });
			return;
		}

		res.status(200).json({
			id: job.id,
			projectId: job.projectId,
			jobType: job.jobType,
			status: job.status,
			attempts: job.attempts,
			lastError: job.lastError,
			createdAt: job.createdAt.toISOString(),
			updatedAt: job.updatedAt.toISOString(),
			completedAt: job.completedAt?.toISOString() ?? null,
		});
	});

	return router;
}
