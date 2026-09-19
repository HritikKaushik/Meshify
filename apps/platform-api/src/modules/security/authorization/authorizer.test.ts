import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AuthContext, ProjectMembership } from '@meshify/data-access';
import { InMemoryProjectRepository, buildAuthContext, buildProject } from '@meshify/testing';
import { createRouter } from '../../../http/router.js';
import { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import type { RbacEnforcementMode } from './authorizer.js';
import { buildTestAuthorizer } from './authorizer.testutil.js';

const ORG = 'org-1';
const OPEN_PROJECT = '11111111-1111-4111-8111-111111111111'; // predates roles: open to the org as developer
const PRIVATE_PROJECT = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_PROJECT = '33333333-3333-4333-8333-333333333333';
const MISSING_PROJECT = '44444444-4444-4444-8444-444444444444';
const USER = 'user-uuid-1';

const user = (orgRole: 'owner' | 'admin' | 'member'): AuthContext => buildAuthContext({ orgId: ORG, keyKind: 'bff', userId: USER, orgRole, isOrgAdmin: orgRole !== 'member' });
const serviceKey = (scopes: string[]): AuthContext => buildAuthContext({ orgId: ORG, keyKind: 'service', scopes });
const legacyUser = (isOrgAdmin: boolean): AuthContext => buildAuthContext({ orgId: ORG, keyKind: 'bff', isOrgAdmin });

let server: Server | undefined;
afterEach(async () => {
	if (server) await new Promise((resolve) => server!.close(resolve));
	server = undefined;
});

/** A tiny app behind the REAL authorizer: one org route, a project read, a project write, a project admin action. */
async function start(opts: { auth: AuthContext; mode?: RbacEnforcementMode; memberships?: Record<string, string> }) {
	const projects = new InMemoryProjectRepository({
		projects: [
			buildProject({ id: OPEN_PROJECT, orgId: ORG, defaultMemberRoleKey: 'developer' }),
			buildProject({ id: PRIVATE_PROJECT, orgId: ORG, defaultMemberRoleKey: null }),
			buildProject({ id: OTHER_ORG_PROJECT, orgId: 'org-2', defaultMemberRoleKey: 'developer' }),
		],
	});
	const memberships = opts.memberships ?? {};
	const built = buildTestAuthorizer({
		getProject: new GetProjectUseCase(projects),
		mode: opts.mode,
		memberships: {
			findByProjectAndUser: async (projectId, userId) =>
				userId === USER && memberships[projectId] ? ({ projectId, userId, roleKey: memberships[projectId] } as ProjectMembership) : undefined,
		},
	});
	const { authorize } = built.authz;

	const router = createRouter();
	router.post('/v1/providers/llm/:provider/connect', authorize('llm_providers:manage'), (_req, res) => void res.json({ reached: 'org' }));
	router.get('/v1/projects/:projectId/documents', authorize('documents:read'), (req, res) => void res.json({ reached: 'read', role: req.projectAccess?.role, source: req.projectAccess?.source }));
	router.post('/v1/projects/:projectId/repositories', authorize('repositories:write'), (_req, res) => void res.json({ reached: 'write' }));
	router.delete('/v1/projects/:projectId', authorize('project:delete'), (_req, res) => void res.json({ reached: 'admin' }));

	const app = express();
	app.use((req, _res, next) => {
		req.auth = opts.auth;
		next();
	});
	app.use(router);
	server = createServer(app);
	await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const call = async (method: string, path: string) => {
		const res = await fetch(`${base}${path}`, { method });
		return { status: res.status, text: await res.text() };
	};
	return { call, ...built };
}

describe('authorize - a project the caller cannot see', () => {
	it('is byte-identical to a project that does not exist, and to another org\'s project', async () => {
		const { call } = await start({ auth: user('member') });

		const hidden = await call('GET', `/v1/projects/${PRIVATE_PROJECT}/documents`);
		const missing = await call('GET', `/v1/projects/${MISSING_PROJECT}/documents`);
		const foreign = await call('GET', `/v1/projects/${OTHER_ORG_PROJECT}/documents`);

		expect(hidden.status).toBe(404);
		expect(hidden.text.replace(PRIVATE_PROJECT, 'ID')).toBe(missing.text.replace(MISSING_PROJECT, 'ID'));
		expect(foreign.text.replace(OTHER_ORG_PROJECT, 'ID')).toBe(missing.text.replace(MISSING_PROJECT, 'ID'));
	});

	it('is a 404 for every action, never a 403 that would confirm it exists', async () => {
		const { call, denials } = await start({ auth: user('member') });
		expect((await call('DELETE', `/v1/projects/${PRIVATE_PROJECT}`)).status).toBe(404);
		expect(denials.at(-1)).toMatchObject({ permission: 'project:delete', outcome: 'hidden', projectId: PRIVATE_PROJECT, userId: USER });
	});
});

describe('authorize - project roles', () => {
	it('a member with an explicit role gets exactly that role', async () => {
		const { call } = await start({ auth: user('member'), memberships: { [PRIVATE_PROJECT]: 'viewer' } });

		const read = await call('GET', `/v1/projects/${PRIVATE_PROJECT}/documents`);
		expect(read.status).toBe(200);
		expect(JSON.parse(read.text)).toEqual({ reached: 'read', role: 'viewer', source: 'explicit' });

		const write = await call('POST', `/v1/projects/${PRIVATE_PROJECT}/repositories`);
		expect(write.status).toBe(403);
		expect(JSON.parse(write.text)).toEqual({ error: 'You do not have permission to do this', code: 'forbidden', permission: 'repositories:write' });
	});

	it('a project that predates roles stays open to every org member, at its default role', async () => {
		const { call } = await start({ auth: user('member') });

		expect(JSON.parse((await call('GET', `/v1/projects/${OPEN_PROJECT}/documents`)).text)).toEqual({ reached: 'read', role: 'developer', source: 'project_default' });
		expect((await call('POST', `/v1/projects/${OPEN_PROJECT}/repositories`)).status).toBe(200);
		// Open is not the same as unguarded: a developer still cannot delete the project.
		expect((await call('DELETE', `/v1/projects/${OPEN_PROJECT}`)).status).toBe(403);
	});

	it('an explicit role wins over the project default, even when it grants less', async () => {
		const { call } = await start({ auth: user('member'), memberships: { [OPEN_PROJECT]: 'viewer' } });
		expect((await call('POST', `/v1/projects/${OPEN_PROJECT}/repositories`)).status).toBe(403);
	});

	it('an org admin controls a private project they hold no role in', async () => {
		const { call } = await start({ auth: user('admin') });
		expect(JSON.parse((await call('GET', `/v1/projects/${PRIVATE_PROJECT}/documents`)).text)).toEqual({ reached: 'read', role: null, source: 'org_role' });
		expect((await call('DELETE', `/v1/projects/${PRIVATE_PROJECT}`)).status).toBe(200);
	});

	it('a membership naming a role the catalog does not define grants nothing, and is reported', async () => {
		const { call, unknownRoles } = await start({ auth: user('member'), memberships: { [PRIVATE_PROJECT]: 'release_manager' } });
		expect((await call('GET', `/v1/projects/${PRIVATE_PROJECT}/documents`)).status).toBe(404);
		expect(unknownRoles).toEqual(['release_manager']);
	});
});

describe('authorize - org permissions', () => {
	it('lets an admin manage AI providers and refuses a member with the permission named', async () => {
		expect((await (await start({ auth: user('admin') })).call('POST', '/v1/providers/llm/openai/connect')).status).toBe(200);

		const member = await start({ auth: user('member') });
		const refused = await member.call('POST', '/v1/providers/llm/openai/connect');
		expect(refused.status).toBe(403);
		expect(JSON.parse(refused.text)).toMatchObject({ code: 'forbidden', permission: 'llm_providers:manage' });
		expect(member.denials).toEqual([expect.objectContaining({ permission: 'llm_providers:manage', outcome: 'forbidden', route: '/v1/providers/llm/:provider/connect', principalKind: 'user' })]);
	});
});

describe('authorize - service keys', () => {
	it('a scoped key reaches exactly its scopes, in every project, and never inherits a project default role', async () => {
		const { call } = await start({ auth: serviceKey(['documents:read', 'project:read']) });
		expect((await call('GET', `/v1/projects/${PRIVATE_PROJECT}/documents`)).status).toBe(200);
		// OPEN_PROJECT would make a PERSON a developer; a key's reach is its scopes and nothing else.
		expect((await call('POST', `/v1/projects/${OPEN_PROJECT}/repositories`)).status).toBe(403);
		expect((await call('POST', '/v1/providers/llm/openai/connect')).status).toBe(403);
	});

	it('a key scoped to something else cannot even see a project', async () => {
		const { call } = await start({ auth: serviceKey(['llm_providers:manage']) });
		expect((await call('GET', `/v1/projects/${OPEN_PROJECT}/documents`)).status).toBe(404);
		expect((await call('POST', '/v1/providers/llm/openai/connect')).status).toBe(200);
	});

	it('an unscoped key is still unrestricted until the cutover migration rewrites it', async () => {
		const { call } = await start({ auth: serviceKey([]) });
		expect((await call('DELETE', `/v1/projects/${PRIVATE_PROJECT}`)).status).toBe(200);
	});
});

describe('authorize - a BFF key with no verified identity (rollout fallback)', () => {
	it('gets what its forwarded admin/member flag always meant', async () => {
		const admin = await start({ auth: legacyUser(true) });
		expect((await admin.call('DELETE', `/v1/projects/${PRIVATE_PROJECT}`)).status).toBe(200);

		const member = await start({ auth: legacyUser(false) });
		expect((await member.call('GET', `/v1/projects/${OPEN_PROJECT}/documents`)).status).toBe(200);
		expect((await member.call('GET', `/v1/projects/${PRIVATE_PROJECT}/documents`)).status).toBe(404);
		expect((await member.call('POST', '/v1/providers/llm/openai/connect')).status).toBe(403);
	});
});

describe('authorize - shadow mode', () => {
	it('lets every request through and reports exactly what enforce would have refused', async () => {
		const { call, denials } = await start({ auth: user('member'), mode: 'shadow', memberships: { [PRIVATE_PROJECT]: 'viewer' } });

		expect((await call('GET', `/v1/projects/${PRIVATE_PROJECT}/documents`)).status).toBe(200); // allowed: not reported
		expect((await call('POST', `/v1/projects/${PRIVATE_PROJECT}/repositories`)).status).toBe(200); // would be 403
		expect((await call('POST', '/v1/providers/llm/openai/connect')).status).toBe(200); // would be 403

		expect(denials.map((d) => [d.permission, d.outcome])).toEqual([
			['repositories:write', 'forbidden'],
			['llm_providers:manage', 'forbidden'],
		]);
	});

	it('never relaxes tenant isolation: another org\'s project is a 404 in shadow mode too', async () => {
		const { call } = await start({ auth: user('owner'), mode: 'shadow' });
		expect((await call('GET', `/v1/projects/${OTHER_ORG_PROJECT}/documents`)).status).toBe(404);
	});
});

describe('checkProjectById', () => {
	it('answers allowed / hidden / forbidden in enforce mode, and always allowed (but reported) in shadow', async () => {
		const req = { auth: user('member'), route: { path: '/v1/jobs/:jobId' } } as never;

		const enforcing = await start({ auth: user('member'), memberships: { [PRIVATE_PROJECT]: 'viewer' } });
		expect(await enforcing.authz.checkProjectById(req, PRIVATE_PROJECT, 'jobs:read')).toBe('allowed');
		expect(await enforcing.authz.checkProjectById(req, PRIVATE_PROJECT, 'connectors:manage')).toBe('forbidden');
		expect(await enforcing.authz.checkProjectById(req, OTHER_ORG_PROJECT, 'jobs:read')).toBe('hidden');
		expect(await enforcing.authz.checkProjectById(req, MISSING_PROJECT, 'jobs:read')).toBe('hidden');
		await new Promise((resolve) => server!.close(resolve));

		const shadow = await start({ auth: user('member'), mode: 'shadow' });
		expect(await shadow.authz.checkProjectById(req, PRIVATE_PROJECT, 'jobs:read')).toBe('allowed');
		expect(shadow.denials).toEqual([expect.objectContaining({ permission: 'jobs:read', outcome: 'hidden', route: '/v1/jobs/:jobId' })]);
	});
});
