import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@meshify/data-access';
import { AuthenticateApiKeyUseCase, AuthenticationError } from '../application/authenticate.usecase.js';
import { authGuard } from './auth.guard.js';
import { mockRequest, mockResponse } from './http-mocks.testutil.js';

function usecaseReturning(result: AuthContext | Error): AuthenticateApiKeyUseCase {
	return {
		execute: async () => {
			if (result instanceof Error) throw result;
			return result;
		},
	} as unknown as AuthenticateApiKeyUseCase;
}

describe('authGuard', () => {
	it('attaches req.auth and calls next on success', async () => {
		const req = mockRequest();
		const res = mockResponse();
		const next = vi.fn();
		await authGuard(usecaseReturning({ orgId: 'org-1', keyId: 'k1', scopes: [], isOrgAdmin: true }))(req, res, next);

		expect(req.auth).toEqual({ orgId: 'org-1', keyId: 'k1', scopes: [], isOrgAdmin: true });
		expect(next).toHaveBeenCalledOnce();
	});

	it('returns 401 with a Bearer challenge on AuthenticationError', async () => {
		const req = mockRequest();
		const res = mockResponse();
		const next = vi.fn();
		await authGuard(usecaseReturning(new AuthenticationError('Invalid API key')))(req, res, next);

		expect(res.statusCode).toBe(401);
		expect(res.getHeader('WWW-Authenticate')).toBe('Bearer');
		expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 500 (not 401) on an unexpected error so outages are not read as bad keys', async () => {
		const req = mockRequest();
		const res = mockResponse();
		const next = vi.fn();
		await authGuard(usecaseReturning(new Error('db down')))(req, res, next);

		expect(res.statusCode).toBe(500);
		expect(next).not.toHaveBeenCalled();
	});
});
