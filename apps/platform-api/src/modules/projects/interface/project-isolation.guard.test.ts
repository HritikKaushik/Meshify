import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@meshify/data-access';
import type { GetProjectUseCase } from '../application/get-project.usecase.js';
import { projectIsolationGuard } from './project-isolation.guard.js';
import { mockRequest, mockResponse } from '../../security/interface/http-mocks.testutil.js';

function getProjectReturning(project: Project | undefined): GetProjectUseCase {
	return { execute: async () => project } as unknown as GetProjectUseCase;
}

const PID = '0a5f9c2e-1b3d-4e6f-8a9b-0c1d2e3f4a5b';
const project = (orgId: string) => ({ id: PID, orgId } as unknown as Project);

const req = (auth: unknown, projectId = PID) =>
	mockRequest({ auth, params: { projectId } } as never);

describe('projectIsolationGuard', () => {
	it('attaches req.project and calls next when the project belongs to the caller org', async () => {
		const res = mockResponse();
		const next = vi.fn();
		const r = req({ orgId: 'org-1', keyId: 'k', scopes: [], isOrgAdmin: true });
		await projectIsolationGuard(getProjectReturning(project('org-1')))(r, res, next);

		expect(r.project?.id).toBe(PID);
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

	it('rejects a malformed project id with 400 before touching the repository', async () => {
		const res = mockResponse();
		const next = vi.fn();
		const execute = vi.fn(async () => project('org-1'));
		await projectIsolationGuard({ execute } as unknown as GetProjectUseCase)(req({ orgId: 'org-1', keyId: 'k', scopes: [], isOrgAdmin: true }, 'not-a-uuid'), res, next);
		expect(res.statusCode).toBe(400);
		expect(execute).not.toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
	});

	it('forwards a repository failure to next(err) instead of rejecting (which used to crash the process)', async () => {
		const res = mockResponse();
		const next = vi.fn();
		const boom = new Error('connection refused');
		const failing = { execute: async () => { throw boom; } } as unknown as GetProjectUseCase;
		await expect(projectIsolationGuard(failing)(req({ orgId: 'org-1', keyId: 'k', scopes: [], isOrgAdmin: true }), res, next)).resolves.toBeUndefined();
		expect(next).toHaveBeenCalledWith(boom);
		expect(res.statusCode).toBe(200); // untouched: the error middleware answers
	});
});
