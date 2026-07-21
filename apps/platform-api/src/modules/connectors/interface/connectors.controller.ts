import { Router } from 'express';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import { OrgAdminForbiddenError, requireOrgAdmin } from '../../security/authorization/org-authorization.js';
import type { ListConnectorsUseCase } from '../application/list-connectors.usecase.js';
import { ConnectorNotFoundError, type DeleteConnectorUseCase } from '../application/delete-connector.usecase.js';

/**
 * The generic Knowledge Sources API — one unified list of every connected
 * source (GitHub, Documents, Slack) and a single disconnect endpoint. Source-
 * specific intake stays on the per-source controllers (`/repositories`,
 * `/documents`, `/connectors/slack/...`).
 */
export function createConnectorsController(deps: {
	getProject: GetProjectUseCase;
	listConnectors: ListConnectorsUseCase;
	deleteConnector: DeleteConnectorUseCase;
}): Router {
	const router = Router();
	const guard = projectIsolationGuard(deps.getProject);

	router.get('/v1/projects/:projectId/connectors', guard, async (req, res) => {
		const connectors = await deps.listConnectors.execute(req.project!.id);
		res.status(200).json({ connectors });
	});

	router.delete('/v1/projects/:projectId/connectors/:connectorId', guard, async (req, res) => {
		try {
			requireOrgAdmin(req.auth!, 'disconnect knowledge sources');
			await deps.deleteConnector.execute({ project: req.project!, connectorId: req.params.connectorId as string });
			res.status(204).send();
		} catch (err) {
			if (err instanceof OrgAdminForbiddenError) {
				res.status(403).json({ error: err.message });
				return;
			}
			if (err instanceof ConnectorNotFoundError) {
				res.status(404).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'failed to delete connector');
			res.status(502).json({ error: 'Failed to disconnect source — see server logs' });
		}
	});

	return router;
}
