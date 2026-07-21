import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@meshify/data-access';
import type { GetProjectUseCase } from '../application/get-project.usecase.js';
import { projectIsolationGuard } from './project-isolation.guard.js';
import { mockRequest, mockResponse } from '../../security/interface/http-mocks.testutil.js';

function getProjectReturning(project: Project | undefined): GetProjectUseCase {
	return { execute: async () => project } as unknown as GetProjectUseCase;
}

const project = (orgId: string) => ({ id: 'p1', orgId } as unknown as Project);

const req = (auth: unknown, projectId = 'p1') =>
	mockRequest({ auth, params: { projectId } } as never);

describe('projectIsolationGuard', () => {
	it('attaches req.project and calls next when the project belongs to the caller org', async () => {
		const res = mockResponse();
		const next = vi.fn();
		const r = req({ orgId: 'org-1', keyId: 'k', scopes: [], isOrgAdmin: true });
		await projectIsolationGuard(getProjectReturning(project('org-1')))(r, res, next);

		expect(r.project?.id).toBe('p1');
		expect(next).toHaveBeenCalledOnce();
	});

	it('returns 404 (not 403) when the project belongs to another org — no cross-tenant probing', async () => {
		const res = mockResponse();
		const next = vi.fn();
		await projectIsolationGuard(getProjectReturning(project('org-2')))(req({ orgId: 'org-1', keyId: 'k', scopes: [], isOrgAdmin: true }), res, next);

		expect(res.statusCode).toBe(404);
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 404 when the project does not exist', async () => {
		const res = mockResponse();
		const next = vi.fn();
		await projectIsolationGuard(getProjectReturning(undefined))(req({ orgId: 'org-1', keyId: 'k', scopes: [], isOrgAdmin: true }), res, next);
		expect(res.statusCode).toBe(404);
	});

	it('returns 401 when unauthenticated (defence in depth if authGuard is missing)', async () => {
		const res = mockResponse();
		const next = vi.fn();
		await projectIsolationGuard(getProjectReturning(project('org-1')))(req(undefined), res, next);
		expect(res.statusCode).toBe(401);
		expect(next).not.toHaveBeenCalled();
	});
});
