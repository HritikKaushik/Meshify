import type { Router } from 'express';
import { DocumentFilenameConflictError, DocumentValidationError } from '../application/upload-document.usecase.js';
import { createRouter } from '../../../http/router.js';
import type { Authorizer } from '../../security/authorization/authorizer.js';
import multer from 'multer';
import type { Document } from '@meshify/data-access';
import { requireUuidParams } from '../../../http/require-uuid-params.js';
import type { UploadDocumentUseCase } from '../application/upload-document.usecase.js';
import type { ListDocumentsUseCase } from '../application/list-documents.usecase.js';
import { DeleteDocumentUseCase, DocumentNotFoundError } from '../application/delete-document.usecase.js';
import type { GetDocumentContentUseCase } from '../application/get-document-content.usecase.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function toResponse(doc: Document) {
	return {
		id: doc.id,
		filename: doc.filename,
		sourceType: doc.sourceType,
		status: doc.status,
		createdAt: doc.createdAt.toISOString(),
		updatedAt: doc.updatedAt.toISOString(),
	};
}

export function createDocumentsController(deps: {
	authz: Authorizer;
	uploadDocument: UploadDocumentUseCase;
	listDocuments: ListDocumentsUseCase;
	deleteDocument: DeleteDocumentUseCase;
	getDocumentContent: GetDocumentContentUseCase;
}): Router {
	const router = createRouter();
	const { authorize } = deps.authz;

	// List a project's ingested documents (newest first) for the Documents screen.
	router.get('/v1/projects/:projectId/documents', authorize('documents:read'), async (req, res) => {
		const documents = await deps.listDocuments.execute(req.project!.id);
		res.status(200).json({ documents: documents.map(toResponse) });
	});

	router.post('/v1/projects/:projectId/documents', authorize('documents:write'), upload.single('file'), async (req, res) => {
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
				userId: req.auth!.userId,
			});

			res.status(202).json({
				documentId: result.document.id,
				status: result.document.status,
				jobId: result.deduped ? undefined : result.jobId,
				deduped: result.deduped,
			});
		} catch (err) {
			if (err instanceof DocumentValidationError) {
				res.status(400).json({ error: err.message });
				return;
			}
			if (err instanceof DocumentFilenameConflictError) {
				res.status(409).json({ error: err.message, existingDocumentId: err.existingDocumentId });
				return;
			}
			// Storage/database/queue failures are not the client's fault: let the
			// terminal error middleware answer 500 and log the cause.
			throw err;
		}
	});

	// Remove an ingested document — purges its vectors, raw upload, and DB row.
	router.delete('/v1/projects/:projectId/documents/:documentId', authorize('documents:delete'), requireUuidParams('documentId'), async (req, res) => {
		try {
			await deps.deleteDocument.execute({
				project: req.project!,
				documentId: req.params.documentId as string,
			});
			res.status(204).send();
		} catch (err) {
			if (err instanceof DocumentNotFoundError) {
				res.status(404).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'failed to delete document');
			res.status(502).json({ error: 'Failed to delete document — see server logs' });
		}
	});

	// Stream a document's raw upload back (project-isolation enforced) — powers the
	// Documents grid's PDF thumbnails and in-app previews.
	router.get('/v1/projects/:projectId/documents/:documentId/content', authorize('documents:read'), requireUuidParams('documentId'), async (req, res) => {
		try {
			const { buffer, contentType, filename } = await deps.getDocumentContent.execute({
				projectId: req.project!.id,
				documentId: req.params.documentId as string,
			});
			res.setHeader('Content-Type', contentType);
			res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
			res.setHeader('Cache-Control', 'private, max-age=300');
			res.status(200).send(buffer);
		} catch (err) {
			if (err instanceof DocumentNotFoundError) {
				res.status(404).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'failed to fetch document content');
			res.status(502).json({ error: 'Failed to fetch document content — see server logs' });
		}
	});

	return router;
}
