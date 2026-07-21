import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireUuidParams } from './require-uuid-params.js';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function run(params: Record<string, string>, ...names: string[]) {
	const req = { params } as unknown as Request;
	const json = vi.fn();
	const status = vi.fn(() => ({ json }) as unknown as Response);
	const res = { status } as unknown as Response;
	const next = vi.fn();
	requireUuidParams(...names)(req, res, next);
	return { next, status, json };
}

describe('requireUuidParams', () => {
	it('calls next when the param is a valid UUID', () => {
		const { next, status } = run({ documentId: UUID }, 'documentId');
		expect(next).toHaveBeenCalledOnce();
		expect(status).not.toHaveBeenCalled();
	});

	it('rejects a non-UUID param with 400', () => {
		const { next, status, json } = run({ documentId: 'not-a-uuid' }, 'documentId');
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith({ error: 'Invalid "documentId" — expected a UUID' });
	});

	it('rejects a missing param with 400', () => {
		const { next, status } = run({}, 'documentId');
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(400);
	});

	it('validates every named param and rejects if any is invalid', () => {
		const { next, status } = run({ a: UUID, b: 'nope' }, 'a', 'b');
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(400);
	});

	it('passes when all named params are valid UUIDs', () => {
		const { next, status } = run({ a: UUID, b: UUID }, 'a', 'b');
		expect(next).toHaveBeenCalledOnce();
		expect(status).not.toHaveBeenCalled();
	});
});
