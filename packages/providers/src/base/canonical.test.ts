import { describe, expect, it } from 'vitest';
import { buildSourceRef, parseSourceRef } from './canonical.js';

describe('canonical sourceRef scheme', () => {
	it('round-trips a fully-tiered ref', () => {
		const ref = buildSourceRef({ provider: 'sharepoint', accountId: 'tenant-1', workspaceId: 'site-9', resourceId: 'lib-2', itemPath: 'docs/spec.docx' });
		expect(ref).toBe('sharepoint/tenant-1/site-9/lib-2/docs/spec.docx');
		expect(parseSourceRef(ref)).toEqual({ provider: 'sharepoint', accountId: 'tenant-1', workspaceId: 'site-9', resourceId: 'lib-2', itemPath: 'docs/spec.docx' });
	});

	it('collapses the workspace tier to the account for flat providers', () => {
		const ref = buildSourceRef({ provider: 'github', accountId: '12345', resourceId: '42', itemPath: 'src/index.ts' });
		expect(ref).toBe('github/12345/12345/42/src/index.ts');
		expect(parseSourceRef(ref)?.workspaceId).toBe('12345');
	});

	it('preserves multi-segment item paths', () => {
		const parsed = parseSourceRef('github/1/1/42/a/b/c.ts');
		expect(parsed?.itemPath).toBe('a/b/c.ts');
	});

	it('rejects slash-bearing segments and refuses legacy refs on parse', () => {
		expect(() => buildSourceRef({ provider: 'github', accountId: 'a/b', resourceId: 'r', itemPath: 'x' })).toThrow(/Invalid sourceRef/);
		expect(parseSourceRef('slack/T111/C1/17357-0')).toBeUndefined(); // legacy 4-segment slack ref
		expect(parseSourceRef('src/index.ts')).toBeUndefined(); // legacy bare file path
	});
});
