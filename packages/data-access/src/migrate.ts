import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { loadEnv } from '@meshify/config';

// SQL lives inside this package (packages/data-access/migrations) so the
// schema and the code that owns it version together.
const MIGRATIONS_DIR = path.resolve(fileURLToPath(import.meta.url), '../../migrations');

// Serializes concurrent runners. On a PaaS every service can run this migrator as
// its pre-deploy step (see render.yaml), and a release deploys several services at
// once - so two runners racing on the same file would each try the DDL and one
// would fail on the schema_migrations primary key. Holding a session-level
// advisory lock for the whole run makes the second wait, then skip what the first
// applied. hashtext() keeps the key distinct from the observability leader lock.
// Session-level ⇒ run against a direct (non-transaction-pooled) connection.
const MIGRATION_LOCK_KEY = "hashtext('meshify:data-access:migrate')";

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
	await client.query(`
		create table if not exists schema_migrations (
			filename text primary key,
			applied_at timestamptz not null default now()
		)
	`);
}

async function appliedMigrations(client: pg.PoolClient): Promise<Set<string>> {
	const { rows } = await client.query<{ filename: string }>('select filename from schema_migrations');
	return new Set(rows.map((r) => r.filename));
}

async function main(): Promise<void> {
	const env = loadEnv();
	const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
	const client = await pool.connect();

	try {
		await client.query(`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
		await ensureMigrationsTable(client);
		const already = await appliedMigrations(client);

		const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

		for (const file of files) {
			if (already.has(file)) {
				console.log(`skip  ${file} (already applied)`);
				continue;
			}

			const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
			console.log(`apply ${file}`);

			await client.query('begin');
			try {
				await client.query(sql);
				await client.query('insert into schema_migrations (filename) values ($1)', [file]);
				await client.query('commit');
			} catch (err) {
				await client.query('rollback');
				throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
			}
		}

		console.log('Migrations complete.');
	} finally {
		await client.query(`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`).catch(() => undefined);
		client.release();
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
