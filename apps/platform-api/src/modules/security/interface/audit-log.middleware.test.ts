import { describe, expect, it, vi } from 'vitest';
import type { AuditLogEntry, AuditLogRepository } from '@meshify/data-access';
import { auditLogMiddleware } from './audit-log.middleware.js';
import { mockRequest, mockResponse } from './http-mocks.testutil.js';

function recorder() {
	const records: AuditLogEntry[] = [];
	const repo: AuditLogRepository = { record: async (e) => void records.push(e) };
	return { repo, records };
}

const AUTH = { orgId: 'org-1', keyId: 'key-1', scopes: [], isOrgAdmin: true };

describe('auditLogMiddleware', () => {
	it('records a mutating request on finish with org, actor key, project, ip and status', async () => {
		const { repo, records } = recorder();
		const req = mockRequest({
			method: 'POST',
			path: '/v1/projects/p1/documents',
			originalUrl: '/v1/projects/p1/documents',
			auth: AUTH,
			params: { projectId: 'p1' },
			ip: '203.0.113.5',
		} as never);
		const res = mockResponse();
		const next = vi.fn();

		auditLogMiddleware(repo)(req, res, next);
		expect(next).toHaveBeenCalledOnce();

		res.status(201);
		res.emitFinish();
		await vi.waitFor(() => expect(records).toHaveLength(1));

		expect(records[0]).toMatchObject({
			orgId: 'org-1',
			actorKeyId: 'key-1',
			projectId: 'p1',
			resourceType: 'projects',
			ipAddress: '203.0.113.5',
			metadata: { status: 201 },
		});
	});

	it('does not record GET requests', async () => {
		const { repo, records } = recorder();
		const req = mockRequest({ method: 'GET', auth: AUTH } as never);
		const res = mockResponse();
		auditLogMiddleware(repo)(req, res, vi.fn());
		res.emitFinish();
		await new Promise((r) => setTimeout(r, 0));
		expect(records).toHaveLength(0);
	});

	it('does not record when unauthenticated', async () => {
		const { repo, records } = recorder();
		const req = mockRequest({ method: 'DELETE' } as never);
		const res = mockResponse();
		auditLogMiddleware(repo)(req, res, vi.fn());
		res.emitFinish();
		await new Promise((r) => setTimeout(r, 0));
		expect(records).toHaveLength(0);
	});

	it('never throws into the request path if recording fails', async () => {
		const repo: AuditLogRepository = {
			record: async () => {
				throw new Error('db down');
			},
		};
		const req = mockRequest({ method: 'POST', auth: AUTH } as never);
		const res = mockResponse();
		const next = vi.fn();
		expect(() => auditLogMiddleware(repo)(req, res, next)).not.toThrow();
		expect(() => res.emitFinish()).not.toThrow();
	});
});
