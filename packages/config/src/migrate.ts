import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { loadEnv } from './env.js';

const MIGRATIONS_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../infra/migrations');

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
		client.release();
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
