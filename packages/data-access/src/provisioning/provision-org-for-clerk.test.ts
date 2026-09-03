import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { provisionOrgForClerk } from './provision-org-for-clerk.js';
import { encryptSecret } from './secret-encryption.js';

const KEY = 'unit-test-org-key-encryption-secret-32!!';

/**
 * A scripted pg.Pool double: `connect()` hands out a client whose `query`
 * records every statement and answers from a lookup keyed on SQL fragments.
 * Statements not in the script resolve to zero rows.
 */
function fakePool(script: Record<string, (params: unknown[]) => unknown[]>) {
	const statements: string[] = [];
	let released = 0;
	const answer = (sql: string, params: unknown[] = []) => {
		statements.push(sql.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase());
		const key = Object.keys(script).find((k) => sql.includes(k));
		const rows = key ? script[key]!(params) : [];
		return Promise.resolve({ rows, rowCount: rows.length });
	};
	const client = { query: answer, release: () => void released++ };
	const pool = { connect: async () => client, query: answer } as unknown as pg.Pool;
	return { pool, statements, releasedCount: () => released };
}

const linkRowFromParams = (params: unknown[]) => [
	{ id: 'link-1', clerk_org_id: params[0], org_id: params[1], api_key_id: params[2], encrypted_secret: params[3], created_at: new Date(0) },
];
const apiKeyRow = () => [{ id: 'key-1', org_id: 'org-1', name: 'n', key_prefix: 'msk_', scopes: [], last_used_at: null, expires_at: null, revoked_at: null, created_at: new Date(0) }];

describe('provisionOrgForClerk', () => {
	it('creates org, key and link inside one transaction and commits', async () => {
		const { pool, statements, releasedCount } = fakePool({
			'insert into organizations': () => [{ id: 'org-1' }],
			'insert into api_keys': apiKeyRow,
			'insert into clerk_org_links': linkRowFromParams,
		});
		const link = await provisionOrgForClerk({ clerkOrgId: 'org_clerk', orgName: 'Acme', pool, pepper: 'pepper', encryptionKey: KEY });

		expect(link.orgId).toBe('org-1');
		expect(link.apiKeyPlaintext).toMatch(/^msk_/);
		expect(statements[0]).toBe('begin');
		expect(statements.at(-1)).toBe('commit');
		expect(statements).not.toContain('rollback');
		expect(releasedCount()).toBe(1);
	});

	it('rolls back its own org + key and adopts the winner when it loses a first-sign-in race', async () => {
		const winnerSecret = encryptSecret(KEY, 'msk_winner', 'org-winner');
		const { pool, statements } = fakePool({
			'insert into organizations': () => [{ id: 'org-loser' }],
			'insert into api_keys': apiKeyRow,
			'insert into clerk_org_links': () => [], // on conflict do nothing → no row
			'select * from clerk_org_links': () => [
				{ id: 'link-w', clerk_org_id: 'org_clerk', org_id: 'org-winner', api_key_id: 'key-w', encrypted_secret: winnerSecret, created_at: new Date(0) },
			],
		});
		const link = await provisionOrgForClerk({ clerkOrgId: 'org_clerk', orgName: 'Acme', pool, pepper: 'pepper', encryptionKey: KEY });

		expect(link.orgId).toBe('org-winner');
		expect(link.apiKeyPlaintext).toBe('msk_winner');
		expect(statements).toContain('rollback');
		expect(statements).not.toContain('commit');
	});

	it('rolls back and rethrows when a write fails mid-way', async () => {
		const { pool, statements, releasedCount } = fakePool({
			'insert into organizations': () => [{ id: 'org-1' }],
			'insert into api_keys': () => {
				throw new Error('connection reset');
			},
		});
		await expect(provisionOrgForClerk({ clerkOrgId: 'org_clerk', orgName: 'Acme', pool, pepper: 'pepper', encryptionKey: KEY })).rejects.toThrow('connection reset');
		expect(statements).toContain('rollback');
		expect(releasedCount()).toBe(1);
	});
});
