import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { createRouter } from './router.js';

let server: Server;
let base = '';
const seen: unknown[] = [];

beforeAll(async () => {
	const app = express();
	const router = createRouter();
	router.get('/ok', async (_req, res) => {
		res.json({ ok: true });
	});
	router.get('/async-reject', async () => {
		throw new Error('async boom');
	});
	router.get('/sync-throw', () => {
		throw new Error('sync boom');
	});
	router.use('/guarded', async () => {
		throw new Error('middleware boom');
	});
	router.get('/guarded/x', (_req, res) => {
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
