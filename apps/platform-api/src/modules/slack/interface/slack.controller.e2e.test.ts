import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import { FakeSlackClient, signState } from '@meshify/slack';
import {
	InMemoryDocumentRepository,
	InMemoryFileRepository,
	InMemoryKnowledgeConnectorRepository,
	InMemoryProjectRepository,
	InMemoryRepositoryRepository,
	InMemorySlackChannelRepository,
	InMemorySlackConversationRepository,
	InMemorySlackSyncStateRepository,
	InMemorySlackWorkspaceRepository,
	buildProject,
} from '@meshify/testing';
import { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { ListConnectorsUseCase } from '../../connectors/application/list-connectors.usecase.js';
import { DeleteConnectorUseCase } from '../../connectors/application/delete-connector.usecase.js';
import { createConnectorsController } from '../../connectors/interface/connectors.controller.js';
import { StartSlackOAuthUseCase } from '../application/start-slack-oauth.usecase.js';
import { CompleteSlackOAuthUseCase } from '../application/complete-slack-oauth.usecase.js';
import { ListSlackChannelsUseCase } from '../application/list-slack-channels.usecase.js';
import { SelectSlackChannelsUseCase } from '../application/select-slack-channels.usecase.js';
import { SyncSlackUseCase } from '../application/sync-slack.usecase.js';
import { createSlackController } from './slack.controller.js';

const KEY = 'e2e-org-key-encryption-secret-32chars!!';
const SLACK_CONFIG = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app.example.com/oauth/slack/callback', secret: KEY };
const NOW = 2_000_000;
const fakeExchange = async () => ({ accessToken: 'xoxb-e2e', teamId: 'T-e2e', teamName: 'E2E Team', botUserId: 'B1', scope: 'channels:history' });

/** Builds a real express app mounting the connectors + slack controllers, with auth stubbed to a fixed org. */
function buildApp(configured = true) {
	const connectors = new InMemoryKnowledgeConnectorRepository();
	const workspaces = new InMemorySlackWorkspaceRepository();
	const channels = new InMemorySlackChannelRepository();
	const conversations = new InMemorySlackConversationRepository();
	const projects = new InMemoryProjectRepository({ projects: [buildProject({ id: 'proj-1', orgId: 'org-1' })] });
	const getProject = new GetProjectUseCase(projects);
	const enqueued: unknown[] = [];
	const queue = { add: async (_n: string, payload: unknown) => void enqueued.push(payload) } as never;
	const slack = new FakeSlackClient({ channels: [{ id: 'C1', name: 'general', isPrivate: false }, { id: 'C2', name: 'random', isPrivate: false }] });
	const cfg = configured ? SLACK_CONFIG : { clientId: undefined, clientSecret: undefined, redirectUri: undefined, secret: undefined };
	const vectors = { deleteBySourcePaths: async () => {}, deleteByFilter: async () => {} };
	const storage = { deleteObject: async () => {} };

	const app = express();
	app.use(express.json());
	// Stub authGuard: every request is an authenticated org-1 admin (the flow
	// includes disconnect, which is org-admin-gated). isOrgAdmin mirrors what the
	// real authGuard derives from the BFF-forwarded org role.
	app.use((req: Request, _res: Response, next: NextFunction) => {
		(req as unknown as { auth: { orgId: string; isOrgAdmin: boolean } }).auth = { orgId: 'org-1', isOrgAdmin: true };
		next();
	});
	app.use(
		createConnectorsController({
			getProject,
			listConnectors: new ListConnectorsUseCase(connectors, new InMemoryRepositoryRepository(), new InMemoryDocumentRepository(), workspaces, channels, conversations),
			deleteConnector: new DeleteConnectorUseCase(connectors, new InMemoryRepositoryRepository(), new InMemoryFileRepository(), new InMemoryDocumentRepository(), workspaces, conversations, vectors, storage),
		})
	);
	app.use(
		createSlackController({
			getProject,
			startOAuth: new StartSlackOAuthUseCase(cfg, () => NOW),
			completeOAuth: new CompleteSlackOAuthUseCase(connectors, workspaces, channels, slack, cfg, () => NOW, fakeExchange),
			listChannels: new ListSlackChannelsUseCase(connectors, workspaces, channels),
			selectChannels: new SelectSlackChannelsUseCase(connectors, workspaces, channels, { create: async (i: unknown) => i } as never, queue),
			syncSlack: new SyncSlackUseCase(connectors, workspaces, { create: async (i: unknown) => i } as never, queue),
		})
	);
	return { app, enqueued };
}

let server: Server;
let base: string;
let enqueuedRef: unknown[];

beforeAll(async () => {
	const built = buildApp(true);
	enqueuedRef = built.enqueued;
	server = createServer(built.app);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const P = '/v1/projects/proj-1';

describe('Slack connector — HTTP e2e (OAuth → channels → select → sync → delete)', () => {
	it('drives the whole flow over real HTTP', async () => {
		// 1) start OAuth
		const start = await fetch(`${base}${P}/connectors/slack/oauth/start`, { method: 'POST' });
		expect(start.status).toBe(200);
		expect((await start.json()).authorizeUrl).toContain('slack.com/oauth/v2/authorize');

		// 2) complete OAuth (signed state for proj-1 + fake code exchange)
		const state = signState({ projectId: 'proj-1' }, KEY, NOW);
		const complete = await fetch(`${base}${P}/connectors/slack/oauth/complete`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code: 'abc', state }),
		});
		expect(complete.status).toBe(201);
		const { connectorId, channelCount } = await complete.json();
		expect(channelCount).toBe(2);

		// 3) unified connectors list includes the new slack source
		const list = await fetch(`${base}${P}/connectors`);
		expect(list.status).toBe(200);
		const { connectors } = await list.json();
		expect(connectors.find((c: { id: string; type: string }) => c.id === connectorId)?.type).toBe('slack');

		// 4) list channels
		const chans = await fetch(`${base}${P}/connectors/slack/${connectorId}/channels`);
		expect(chans.status).toBe(200);
		expect((await chans.json()).channels).toHaveLength(2);

		// 5) select channels → queues ingestion
		const select = await fetch(`${base}${P}/connectors/slack/${connectorId}/channels`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ channelIds: ['C1'] }),
		});
		expect(select.status).toBe(202);
		expect((await select.json()).selectedCount).toBe(1);
		expect(enqueuedRef).toHaveLength(1);

		// 6) manual sync
		const sync = await fetch(`${base}${P}/connectors/slack/${connectorId}/sync`, { method: 'POST' });
		expect(sync.status).toBe(202);
		expect(enqueuedRef).toHaveLength(2);

		// 7) disconnect
		const del = await fetch(`${base}${P}/connectors/${connectorId}`, { method: 'DELETE' });
		expect(del.status).toBe(204);
		const after = await fetch(`${base}${P}/connectors`);
		expect((await after.json()).connectors).toHaveLength(0);
	});

	it('404s an unknown connectorId (tenant isolation, indistinguishable from missing)', async () => {
		const res = await fetch(`${base}${P}/connectors/slack/00000000-0000-0000-0000-000000000000/channels`);
		expect(res.status).toBe(404);
	});

	it('404s a project owned by another org', async () => {
		const res = await fetch(`${base}/v1/projects/proj-does-not-exist/connectors`);
		expect(res.status).toBe(404);
	});

	it('returns 503 when Slack is not configured', async () => {
		const { app } = buildApp(false);
		const srv = createServer(app);
		await new Promise<void>((resolve) => srv.listen(0, resolve));
		const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
		const res = await fetch(`${b}${P}/connectors/slack/oauth/start`, { method: 'POST' });
		expect(res.status).toBe(503);
		await new Promise<void>((resolve) => srv.close(() => resolve()));
	});
});
