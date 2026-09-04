import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { Router, type Request } from 'express';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPlatformApiProxy, createWebhookProxy } from './platform-proxy.js';

interface Captured {
	method: string;
	url: string;
	headers: http.IncomingHttpHeaders;
	body: Buffer;
}

/** A stand-in platform-api that records exactly what arrived. */
function startUpstream(): Promise<{ server: Server; origin: string; last: () => Captured }> {
	let captured: Captured | undefined;
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			captured = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) };
			res.writeHead(202, { 'content-type': 'application/json' });
			res.end('{"ok":true}');
		});
	});
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as AddressInfo;
			resolve({ server, origin: `http://127.0.0.1:${port}`, last: () => captured! });
		});
	});
}

/** The BFF wiring under test: one trusted hop, the webhook passthrough, and the authenticated proxy. */
function startBff(platformApiOrigin: string): Promise<{ server: Server; origin: string }> {
	const app = express();
	app.set('trust proxy', 1);
	app.use('/api/v1/integrations/webhooks', createWebhookProxy(platformApiOrigin));
	const protectedRouter = Router();
	protectedRouter.use((req: Request, _res, next) => {
		req.meshify = { meshifyOrgId: 'org-1', apiKey: 'msk_org_key', orgRole: 'member', userId: 'user_42' };
		next();
	});
	protectedRouter.use(createPlatformApiProxy(platformApiOrigin));
	app.use('/api/v1', protectedRouter);
	return new Promise((resolve) => {
		const server = app.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as AddressInfo;
			resolve({ server, origin: `http://127.0.0.1:${port}` });
		});
	});
}

describe('platform proxies', () => {
	let upstream: Awaited<ReturnType<typeof startUpstream>>;
	let bff: Awaited<ReturnType<typeof startBff>>;

	beforeAll(async () => {
		upstream = await startUpstream();
		bff = await startBff(upstream.origin);
	});
	afterAll(async () => {
		await new Promise((r) => bff.server.close(r));
		await new Promise((r) => upstream.server.close(r));
	});

	it('streams a webhook delivery through byte-identical to the API path, without any trusted header', async () => {
		const body = Buffer.from('{"action":"push","bytes":"é exact"}');
		const res = await fetch(`${bff.origin}/api/v1/integrations/webhooks/github/reg-1`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-hub-signature-256': 'sha256=abc',
				// A caller trying to smuggle BFF-trusted headers past the API.
				authorization: 'Bearer forged',
				'x-meshify-org-role': 'admin',
				'x-meshify-user-id': 'user_other',
			},
			body,
		});
		expect(res.status).toBe(202);
		const got = upstream.last();
		expect(got.method).toBe('POST');
		expect(got.url).toBe('/v1/integrations/webhooks/github/reg-1');
		expect(got.body.equals(body)).toBe(true);
		expect(got.headers['x-hub-signature-256']).toBe('sha256=abc');
		expect(got.headers.authorization).toBeUndefined();
		expect(got.headers['x-meshify-org-role']).toBeUndefined();
		expect(got.headers['x-meshify-user-id']).toBeUndefined();
	});

	it('injects the org key, role and user id on the authenticated proxy, overwriting anything the browser sent', async () => {
		const res = await fetch(`${bff.origin}/api/v1/projects`, {
			headers: { authorization: 'Bearer forged', 'x-meshify-org-role': 'admin', 'x-meshify-user-id': 'user_other' },
		});
		expect(res.status).toBe(202);
		const got = upstream.last();
		expect(got.url).toBe('/v1/projects');
		expect(got.headers.authorization).toBe('Bearer msk_org_key');
		expect(got.headers['x-meshify-org-role']).toBe('member');
		expect(got.headers['x-meshify-user-id']).toBe('user_42');
	});

	it('forwards the address it resolved as the only X-Forwarded-For entry, so a forged chain never reaches the API', async () => {
		// With one trusted hop the client address is the rightmost entry; the
		// leftmost "9.9.9.9" is whatever the caller wrote into the header.
		await fetch(`${bff.origin}/api/v1/projects`, { headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.7', 'x-real-ip': '9.9.9.9' } });
		const got = upstream.last();
		expect(got.headers['x-forwarded-for']).toBe('203.0.113.7');
		expect(got.headers['x-real-ip']).toBeUndefined();
		expect(got.headers['x-forwarded-proto']).toBe('http');
	});
});
