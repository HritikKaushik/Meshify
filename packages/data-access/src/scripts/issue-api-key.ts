import pg from 'pg';
import { loadEnv } from '@meshify/config';
import { generateApiKey, hashApiKey } from '../api-keys/api-key.entity.js';
import { PostgresApiKeyRepository } from '../api-keys/postgres-api-key.repository.js';

/**
 * Ops tool — issues an API key for an organization. Key issuance is deliberately
 * NOT a public endpoint (that would be an unauthenticated way to mint access);
 * an operator runs this against the deployment's database.
 *
 *   pnpm --filter @meshify/data-access issue-api-key -- \
 *     --org-name "Acme"  --key-name "prod-server"  [--scopes read,write] [--expires-days 90]
 *   pnpm --filter @meshify/data-access issue-api-key -- \
 *     --org-id <uuid>    --key-name "ci"
 *
 * The plaintext key is printed ONCE and never stored — copy it now.
 */
function parseArgs(argv: string[]): Map<string, string> {
	const out = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (!flag?.startsWith('--') || value === undefined) {
			throw new Error(`Malformed argument near "${flag ?? ''}". Flags take the form --name value.`);
		}
		out.set(flag.slice(2), value);
	}
	return out;
}

async function resolveOrgId(pool: pg.Pool, args: Map<string, string>): Promise<string> {
	const orgId = args.get('org-id');
	if (orgId) {
		const { rows } = await pool.query('select 1 from organizations where id = $1', [orgId]);
		if (rows.length === 0) throw new Error(`Organization "${orgId}" does not exist`);
		return orgId;
	}

	const orgName = args.get('org-name');
	if (!orgName) throw new Error('Provide either --org-id <uuid> or --org-name <name>.');
	const { rows } = await pool.query<{ id: string }>('insert into organizations (name) values ($1) returning id', [orgName]);
	const created = rows[0];
	if (!created) throw new Error('Failed to create organization');
	console.log(`Created organization "${orgName}" (${created.id})`);
	return created.id;
}

async function main(): Promise<void> {
	const env = loadEnv();
	const args = parseArgs(process.argv.slice(2));

	const keyName = args.get('key-name');
	if (!keyName) throw new Error('--key-name is required.');

	const scopes = (args.get('scopes') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	let expiresAt: Date | null = null;
	const expiresDays = args.get('expires-days');
	if (expiresDays) {
		const days = Number(expiresDays);
		if (!Number.isFinite(days) || days <= 0) throw new Error('--expires-days must be a positive number.');
		expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
	}

	const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
	try {
		const orgId = await resolveOrgId(pool, args);
		const { plaintext, keyPrefix } = generateApiKey();
		const keyHash = hashApiKey(env.PLATFORM_API_KEY_PEPPER, plaintext);

		const keys = new PostgresApiKeyRepository(pool);
		const key = await keys.create({ orgId, name: keyName, keyPrefix, keyHash, scopes, expiresAt });

		console.log('\nAPI key issued. Copy the plaintext now — it will not be shown again.\n');
		console.log(`  id:      ${key.id}`);
		console.log(`  org_id:  ${orgId}`);
		console.log(`  name:    ${key.name}`);
		console.log(`  scopes:  ${scopes.length ? scopes.join(', ') : '(none)'}`);
		console.log(`  expires: ${expiresAt ? expiresAt.toISOString() : 'never'}`);
		console.log(`\n  KEY:     ${plaintext}\n`);
	} finally {
		await pool.end();
	}
}

main().catch((err) => {
	console.error(`\nissue-api-key failed: ${(err as Error).message}`);
	process.exit(1);
});
