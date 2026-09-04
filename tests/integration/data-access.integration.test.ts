import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
	PostgresFileRepository,
	PostgresPipelineJobRepository,
	PostgresProjectRepository,
	PostgresRepositoryRepository,
	PostgresWebhookEventRepository,
	createPgPool,
} from '@meshify/data-access';

/**
 * Exercises the exact SQL of the repositories the reliability work leans on:
 * queued-job dedupe under the partial unique index, the stuck-running scan,
 * multi-row file upserts through `unnest`, split webhook retention, and the
 * session-level advisory lock the worker serializes syncs with. Runs inside a
 * throwaway org/project removed (cascade) in afterAll; skips without a migrated
 * Postgres (same convention as the Slack suite).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://meshify:meshify@localhost:5433/meshify';

let pool: pg.Pool | undefined;
let available = false;
const orgId = randomUUID();
const projectId = randomUUID();

beforeAll(async () => {
	pool = createPgPool({ connectionString: DATABASE_URL, max: 4, statementTimeoutMs: 10_000, applicationName: 'integration-test' }, { error: () => undefined });
	try {
		await pool.query('select 1 from pipeline_jobs limit 1');
		await pool.query('select 1 from webhook_events limit 1');
		available = true;
	} catch {
		available = false;
		await pool.end().catch(() => undefined);
		pool = undefined;
		return;
	}
	await pool.query('insert into organizations (id, name) values ($1, $2)', [orgId, `itest-${orgId}`]);
	await new PostgresProjectRepository(pool).create({
		id: projectId,
		orgId,
		name: 'data-access integration',
		description: null,
		qdrantCollectionDocs: `proj_${projectId.replaceAll('-', '')}_documents`,
		qdrantCollectionCode: `proj_${projectId.replaceAll('-', '')}_code`,
		rocketrideDocsIngestPipelineId: randomUUID(),
		rocketrideCodeIngestPipelineId: randomUUID(),
		rocketrideChatPipelineId: randomUUID(),
		llmProfile: 'openai-5',
		embeddingProfile: 'openai-text-embedding-3-large',
	} as never);
});

afterAll(async () => {
	if (!pool) return;
	await pool.query('delete from webhook_events where provider = $1', ['itest']);
	await pool.query('delete from organizations where id = $1', [orgId]); // cascades project, jobs, repositories, files
	await pool.end();
});

describe('pipeline jobs', () => {
	it('createDeduped keeps one queued job per key, lets a running one be followed by exactly one more, and lists stuck running rows', async (ctx) => {
		if (!available) return ctx.skip();
		const jobs = new PostgresPipelineJobRepository(pool!);
		const key = `itest:${randomUUID()}`;
		const first = await jobs.createDeduped({ id: randomUUID(), projectId, jobType: 'source_sync', payload: { connectorId: 'c' }, dedupeKey: key });
		const second = await jobs.createDeduped({ id: randomUUID(), projectId, jobType: 'source_sync', payload: { connectorId: 'c' }, dedupeKey: key });
		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.job.id).toBe(first.job.id);

		await jobs.markRunning(first.job.id);
		const followUp = await jobs.createDeduped({ id: randomUUID(), projectId, jobType: 'source_sync', payload: { connectorId: 'c' }, dedupeKey: key });
		expect(followUp.created).toBe(true); // a running job does not block the next queued one

		await pool!.query("update pipeline_jobs set updated_at = now() - interval '3 hours' where id = $1", [first.job.id]);
		const stuck = await jobs.listStuckRunning(new Date(Date.now() - 2 * 60 * 60 * 1000));
		expect(stuck.map((j) => j.id)).toContain(first.job.id);
		expect(stuck.map((j) => j.id)).not.toContain(followUp.job.id);
	});
});

describe('files', () => {
	it('upsertMany inserts a tree in one statement and refreshes existing paths back to pending', async (ctx) => {
		if (!available) return ctx.skip();
		const repositories = new PostgresRepositoryRepository(pool!);
		const files = new PostgresFileRepository(pool!);
		const repository = await repositories.create({
			id: randomUUID(),
			projectId,
			connectorId: null,
			source: 'github',
			remoteUrl: 'https://github.com/acme/itest',
			archiveObjectKey: null,
		} as never);
		const input = (path: string, hash: string) => ({ id: randomUUID(), projectId, repositoryId: repository.id, path, language: 'typescript', sizeBytes: 10, contentHash: hash });

		const inserted = await files.upsertMany([input('src/a.ts', 'h1'), input('src/b.ts', 'h2')]);
		expect(inserted.map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
		await files.updateStatusByRepository(repository.id, 'pending', 'embedded');

		const refreshed = await files.upsertMany([input('src/a.ts', 'h1-changed'), input('src/c.ts', 'h3')]);
		expect(refreshed.map((f) => [f.path, f.contentHash, f.status]).sort()).toEqual([
			['src/a.ts', 'h1-changed', 'pending'],
			['src/c.ts', 'h3', 'pending'],
		]);
		const all = await files.listByRepository(repository.id);
		expect(all).toHaveLength(3);
		expect(all.find((f) => f.path === 'src/b.ts')?.status).toBe('embedded');
	});
});

describe('webhook events', () => {
	it('deleteTerminalBefore prunes processed deliveries at one age and failed ones at another', async (ctx) => {
		if (!available) return ctx.skip();
		const events = new PostgresWebhookEventRepository(pool!);
		const record = async (deliveryId: string) => (await events.recordIfNew({ provider: 'itest', deliveryId, eventType: 'push', integrationId: null, payload: {} }))!;
		const processed = await record(`p-${randomUUID()}`);
		const failed = await record(`f-${randomUUID()}`);
		const recent = await record(`r-${randomUUID()}`);
		await events.markStatus(processed.id, 'processed');
		await events.markStatus(failed.id, 'failed', 'boom');
		await events.markStatus(recent.id, 'failed', 'boom');
		await pool!.query("update webhook_events set received_at = now() - interval '45 days' where id = any($1)", [[processed.id, failed.id]]);

		const removed = await events.deleteTerminalBefore(new Date(Date.now() - 30 * 86_400_000), new Date(Date.now() - 90 * 86_400_000));
		expect(removed).toBe(1);
		expect(await events.findById(processed.id)).toBeUndefined();
		expect(await events.findById(failed.id)).toBeDefined();

		expect(await events.deleteTerminalBefore(new Date(Date.now() - 30 * 86_400_000), new Date(Date.now() - 40 * 86_400_000))).toBe(1);
		expect(await events.findById(failed.id)).toBeUndefined();
		expect(await events.findById(recent.id)).toBeDefined();
	});
});

describe('advisory execution lock', () => {
	it('pg_try_advisory_lock is exclusive across sessions and released with the session', async (ctx) => {
		if (!available) return ctx.skip();
		const key = `meshify:sync:connector:${randomUUID()}`;
		const a = await pool!.connect();
		const b = await pool!.connect();
		try {
			const lockA = await a.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtext($1)) as locked', [key]);
			const lockB = await b.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtext($1)) as locked', [key]);
			expect(lockA.rows[0]?.locked).toBe(true);
			expect(lockB.rows[0]?.locked).toBe(false);
			await a.query('select pg_advisory_unlock(hashtext($1))', [key]);
			const retry = await b.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtext($1)) as locked', [key]);
			expect(retry.rows[0]?.locked).toBe(true);
			await b.query('select pg_advisory_unlock(hashtext($1))', [key]);
		} finally {
			a.release();
			b.release();
		}
	});
});
