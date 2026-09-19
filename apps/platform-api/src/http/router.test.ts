import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { UndeclaredRoutePolicyError, createRouter, routeManifest } from './router.js';
import { authenticatedOnly, publicRoute, tagRoutePolicy } from './route-policy.js';

const open = () => publicRoute('test fixture');

let server: Server;
let base = '';
const seen: unknown[] = [];

beforeAll(async () => {
	const app = express();
	const router = createRouter();
	router.get('/ok', open(), async (_req, res) => {
		res.json({ ok: true });
	});
	router.get('/async-reject', open(), async () => {
		throw new Error('async boom');
	});
	router.get('/sync-throw', open(), () => {
		throw new Error('sync boom');
	});
	router.use('/guarded', async () => {
		throw new Error('middleware boom');
	});
	router.get('/guarded/x', open(), (_req, res) => {
		res.json({ reached: true });
	});
	// A 4-argument error handler must keep its arity to be recognised by Express.
	router.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
		seen.push(err);
		res.status(500).json({ error: (err as Error).message });
	});
	app.use(router);
	server = createServer(app);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('createRouter', () => {
	it('serves normal handlers unchanged', async () => {
		const res = await fetch(`${base}/ok`);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it('forwards a rejected async handler to the error middleware instead of crashing', async () => {
		const res = await fetch(`${base}/async-reject`);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: 'async boom' });
		expect(seen.some((e) => (e as Error).message === 'async boom')).toBe(true);
	});

	it('still forwards synchronous throws', async () => {
		const res = await fetch(`${base}/sync-throw`);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: 'sync boom' });
	});

	it('forwards rejections from async middleware registered with use()', async () => {
		const res = await fetch(`${base}/guarded/x`);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: 'middleware boom' });
	});
});

describe('createRouter access policies', () => {
	it('refuses to register an endpoint that declares no policy, naming the route', () => {
		const router = createRouter();
		expect(() => router.post('/v1/things', (_req, res) => void res.json({}))).toThrow(UndeclaredRoutePolicyError);
		expect(() => router.post('/v1/things', (_req, res) => void res.json({}))).toThrow(/POST \/v1\/things declares no access policy/);
	});

	it('checks every endpoint verb, and leaves use() alone (it mounts middleware, not an endpoint)', () => {
		const router = createRouter();
		for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all'] as const) {
			expect(() => router[method]('/x', (_req, res) => void res.end())).toThrow(UndeclaredRoutePolicyError);
		}
		expect(() => router.use('/x', (_req, _res, next) => next())).not.toThrow();
	});

	it('finds the policy anywhere in the handler list, including inside an array', () => {
		const router = createRouter();
		const handler = (_req: express.Request, res: express.Response) => void res.end();
		expect(() => router.get('/a', (_req, _res, next) => next(), authenticatedOnly('after another middleware'), handler)).not.toThrow();
		expect(() => router.get('/b', [open(), handler])).not.toThrow();
	});

	it('refuses two policies on one endpoint: which one applies must never be a question', () => {
		const router = createRouter();
		expect(() => router.get('/x', open(), authenticatedOnly('also this'), (_req, res) => void res.end())).toThrow(/declares 2 access policies/);
	});

	it('records what each endpoint declared, including a route registered on several paths', () => {
		const router = createRouter();
		const needs = tagRoutePolicy((_req, _res, next) => next(), { kind: 'permission', permission: 'documents:write' });
		router.post('/v1/projects/:projectId/documents', needs, (_req, res) => void res.end());
		router.post(['/hooks/:provider', '/hooks/:provider/:registrationId'], publicRoute('signed'), (_req, res) => void res.end());

		expect(routeManifest(router)).toEqual([
			{ method: 'POST', path: '/v1/projects/:projectId/documents', policy: { kind: 'permission', permission: 'documents:write' } },
			{ method: 'POST', path: '/hooks/:provider | /hooks/:provider/:registrationId', policy: { kind: 'public', reason: 'signed' } },
		]);
	});

	it('the tag does not change what a declared route does', async () => {
		const res = await fetch(`${base}/ok`);
		expect(res.status).toBe(200);
	});
});

