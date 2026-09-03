import type { Router } from 'express';
import { requireUuidParams } from '../../../http/require-uuid-params.js';
import { createRouter } from '../../../http/router.js';
import { z } from 'zod';
import type { SlackChannel } from '@meshify/data-access';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import type { StartSlackOAuthUseCase } from '../application/start-slack-oauth.usecase.js';
import type { CompleteSlackOAuthUseCase } from '../application/complete-slack-oauth.usecase.js';
import type { ListSlackChannelsUseCase } from '../application/list-slack-channels.usecase.js';
import type { SelectSlackChannelsUseCase } from '../application/select-slack-channels.usecase.js';
import type { SyncSlackUseCase } from '../application/sync-slack.usecase.js';
import type { AttachSlackWorkspaceUseCase } from '../application/attach-slack-workspace.usecase.js';
import { SlackIntegrationNotFoundError, SlackIntegrationNotUsableError } from '../application/attach-slack-workspace.usecase.js';
import { SlackConnectorNotFoundError, SlackNotConfiguredError } from '../application/slack-support.js';

const completeSchema = z.object({ code: z.string().min(1), state: z.string().min(1) });
const selectSchema = z.object({ channelIds: z.array(z.string().min(1)) });
const attachSchema = z.object({ integrationId: z.string().uuid() });

function toChannel(c: SlackChannel) {
	return { id: c.id, channelId: c.channelId, name: c.name, isPrivate: c.isPrivate, selected: c.selected };
}

/** Maps Slack-specific errors to HTTP; returns true if handled. */
function handleSlackError(err: unknown, res: import('express').Response, log?: { error: (o: unknown, m: string) => void }): boolean {
	if (err instanceof SlackNotConfiguredError) {
		res.status(503).json({ error: err.message });
		return true;
	}
	if (err instanceof SlackConnectorNotFoundError || err instanceof SlackIntegrationNotFoundError) {
		res.status(404).json({ error: err.message });
		return true;
	}
	if (err instanceof SlackIntegrationNotUsableError) {
		res.status(409).json({ error: err.message });
		return true;
	}
	log?.error({ err }, 'slack request failed');
	res.status(400).json({ error: err instanceof Error ? err.message : 'Slack request failed' });
	return true;
}

export function createSlackController(deps: {
	getProject: GetProjectUseCase;
	startOAuth: StartSlackOAuthUseCase;
	completeOAuth: CompleteSlackOAuthUseCase;
	attachWorkspace: AttachSlackWorkspaceUseCase;
	listChannels: ListSlackChannelsUseCase;
	selectChannels: SelectSlackChannelsUseCase;
	syncSlack: SyncSlackUseCase;
}): Router {
	const router = createRouter();
	const guard = projectIsolationGuard(deps.getProject);

	// Provider-platform attach: bind an org-level Slack integration to this
	// project (no second OAuth — the workspace was authorized once, org-wide).
	router.post('/v1/projects/:projectId/connectors/slack', guard, async (req, res) => {
		const parsed = attachSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			const result = await deps.attachWorkspace.execute({
				projectId: req.project!.id,
				orgId: req.auth!.orgId,
				integrationId: parsed.data.integrationId,
			});
			res.status(result.alreadyAttached ? 200 : 201).json(result);
		} catch (err) {
			handleSlackError(err, res, req.log);
		}
	});

	// Begin OAuth: returns the Slack authorize URL for the browser to navigate to.
	router.post('/v1/projects/:projectId/connectors/slack/oauth/start', guard, async (req, res) => {
		try {
			const result = deps.startOAuth.execute({ projectId: req.project!.id });
			res.status(200).json(result);
		} catch (err) {
			handleSlackError(err, res, req.log);
		}
	});

	// Finish OAuth: the same-origin web callback posts { code, state } here.
	router.post('/v1/projects/:projectId/connectors/slack/oauth/complete', guard, async (req, res) => {
		const parsed = completeSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			const result = await deps.completeOAuth.execute({ projectId: req.project!.id, code: parsed.data.code, state: parsed.data.state });
			res.status(201).json(result);
		} catch (err) {
			handleSlackError(err, res, req.log);
		}
	});

	router.get('/v1/projects/:projectId/connectors/slack/:connectorId/channels', guard, requireUuidParams('connectorId'), async (req, res) => {
		try {
			const channels = await deps.listChannels.execute({ projectId: req.project!.id, connectorId: req.params.connectorId as string });
			res.status(200).json({ channels: channels.map(toChannel) });
		} catch (err) {
			handleSlackError(err, res, req.log);
		}
	});

	router.post('/v1/projects/:projectId/connectors/slack/:connectorId/channels', guard, requireUuidParams('connectorId'), async (req, res) => {
		const parsed = selectSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			const result = await deps.selectChannels.execute({ projectId: req.project!.id, connectorId: req.params.connectorId as string, channelIds: parsed.data.channelIds });
			res.status(202).json(result);
		} catch (err) {
			handleSlackError(err, res, req.log);
		}
	});

	router.post('/v1/projects/:projectId/connectors/slack/:connectorId/sync', guard, requireUuidParams('connectorId'), async (req, res) => {
		try {
			const result = await deps.syncSlack.execute({ projectId: req.project!.id, connectorId: req.params.connectorId as string });
			res.status(202).json(result);
		} catch (err) {
			handleSlackError(err, res, req.log);
		}
	});

	return router;
}
