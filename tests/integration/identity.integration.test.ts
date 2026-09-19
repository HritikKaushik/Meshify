import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
	LastOwnerError,
	PostgresAuditLogRepository,
	PostgresChatRepository,
	PostgresDocumentRepository,
	PostgresIntegrationRepository,
	PostgresKnowledgeConnectorRepository,
	PostgresOAuthStateRepository,
	PostgresOrgMembershipRepository,
	PostgresPipelineJobRepository,
	PostgresProjectMembershipRepository,
	PostgresProjectRepository,
	PostgresRepositoryRepository,
	PostgresUserRepository,
	createPgPool,
	syncClerkMember,
	withTransaction,
} from '@meshify/data-access';

/**
 * Migration 0019 against a real Postgres: the constraints that make identity
 * trustworthy are declared in SQL (composite FKs, CHECKs, cascades) and the
 * owner election relies on a row lock, so none of it can be proven with fakes.
 * Runs inside throwaway orgs removed (cascade) in afterAll; skips without a
 * migrated Postgres (same convention as the other integration suites).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://meshify:meshify@localhost:5433/meshify';

let pool: pg.Pool | undefined;
let available = false;
const orgId = randomUUID();
const otherOrgId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const clerkIds: string[] = [];

function clerkId(): string {
	const id = `user_itest_${randomUUID().replaceAll('-', '')}`;
	clerkIds.push(id);
	return id;
}

async function createProject(id: string, org: string): Promise<void> {
	await new PostgresProjectRepository(pool!).create({
		id,
		orgId: org,
		name: `identity integration ${id.slice(0, 8)}`,
		description: null,
		qdrantCollectionDocs: `proj_${id.replaceAll('-', '')}_documents`,
		qdrantCollectionCode: `proj_${id.replaceAll('-', '')}_code`,
		rocketrideDocsIngestPipelineId: randomUUID(),
		rocketrideCodeIngestPipelineId: randomUUID(),
		rocketrideChatPipelineId: randomUUID(),
		llmProfile: 'openai-5',
		embeddingProfile: 'openai-text-embedding-3-large',
	} as never);
}

beforeAll(async () => {
	pool = createPgPool({ connectionString: DATABASE_URL, max: 8, statementTimeoutMs: 10_000, applicationName: 'integration-test' }, { error: () => undefined });
	try {
		await pool.query('select 1 from project_memberships limit 1');
		available = true;
	} catch {
		available = false;
		await pool.end().catch(() => undefined);
		pool = undefined;
		return;
	}
	await pool.query('insert into organizations (id, name) values ($1, $2), ($3, $4)', [orgId, `itest-${orgId}`, otherOrgId, `itest-${otherOrgId}`]);
	await createProject(projectId, orgId);
	await createProject(otherProjectId, otherOrgId);
});

afterAll(async () => {
	if (!pool) return;
	await pool.query('delete from organizations where id = any($1)', [[orgId, otherOrgId]]);
	// users are global, not org-scoped, so the org cascade does not reach them.
	await pool.query('delete from users where clerk_user_id = any($1)', [clerkIds]);
	await pool.end();
});

describe('users', () => {
	it('upserts by Clerk id exactly once and reports which call created the row', async (ctx) => {
		if (!available) return ctx.skip();
		const users = new PostgresUserRepository(pool!);
		const id = clerkId();

		const first = await users.upsertByClerkId(id);
		const second = await users.upsertByClerkId(id);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.user.id).toBe(first.user.id);
	});

	it('updateProfile changes only the fields it is given, and can set one to null', async (ctx) => {
		if (!available) return ctx.skip();
		const users = new PostgresUserRepository(pool!);
		const { user } = await users.upsertByClerkId(clerkId());

		await users.updateProfile(user.id, { email: 'dana@acme.test', displayName: 'Dana' });
		await users.updateProfile(user.id, { displayName: null });

		expect(await users.findById(user.id)).toMatchObject({ email: 'dana@acme.test', displayName: null, avatarUrl: null });
	});

	it('two people may share an email address (it is display data, not identity)', async (ctx) => {
		if (!available) return ctx.skip();
		const users = new PostgresUserRepository(pool!);
		const a = await users.upsertByClerkId(clerkId());
		const b = await users.upsertByClerkId(clerkId());
		await users.updateProfile(a.user.id, { email: 'shared@acme.test' });
		await expect(users.updateProfile(b.user.id, { email: 'shared@acme.test' })).resolves.toBeUndefined();
	});

	it('deactivation scrubs PII but keeps the row attribution points at', async (ctx) => {
		if (!available) return ctx.skip();
		const users = new PostgresUserRepository(pool!);
		const id = clerkId();
		const { user } = await users.upsertByClerkId(id);
		await users.updateProfile(user.id, { email: 'gone@acme.test', displayName: 'Gone', avatarUrl: 'https://img.test/a.png' });

		expect(await users.deactivateByClerkId(id)).toBe(true);

		const after = await users.findById(user.id);
		expect(after).toMatchObject({ email: null, displayName: null, avatarUrl: null });
		expect(after?.deactivatedAt).toBeInstanceOf(Date);
	});
});

describe('syncClerkMember', () => {
	it('elects exactly one owner when many first requests from a new org race', async (ctx) => {
		if (!available) return ctx.skip();
		const racingOrg = randomUUID();
		await pool!.query('insert into organizations (id, name) values ($1, $2)', [racingOrg, `itest-race-${racingOrg}`]);
		try {
			const admins = Array.from({ length: 6 }, () => clerkId());
			const results = await Promise.all(admins.map((clerkUserId) => syncClerkMember({ pool: pool!, orgId: racingOrg, clerkUserId, clerkOrgRole: 'org:admin' })));

			expect(results.filter((r) => r.orgRole === 'owner')).toHaveLength(1);
			expect(results.filter((r) => r.orgRole === 'admin')).toHaveLength(5);
		} finally {
			await pool!.query('delete from organizations where id = $1', [racingOrg]);
		}
	});

	it('seeds a plain member as member, and never moves an existing role when Clerk later disagrees', async (ctx) => {
		if (!available) return ctx.skip();
		const clerkUserId = clerkId();
		const first = await syncClerkMember({ pool: pool!, orgId, clerkUserId, clerkOrgRole: 'org:member' });
		expect(first).toMatchObject({ orgRole: 'member', status: 'active', userCreated: true });

		// Roles are managed in Meshify: a Clerk promotion after the fact is not a Meshify promotion.
		const again = await syncClerkMember({ pool: pool!, orgId, clerkUserId, clerkOrgRole: 'org:admin' });
		expect(again).toMatchObject({ orgRole: 'member', userCreated: false, orgMembershipId: first.orgMembershipId });
	});

	it('reports a removed membership as removed until told to reactivate it, then brings it back clean', async (ctx) => {
		if (!available) return ctx.skip();
		const clerkUserId = clerkId();
		const member = await syncClerkMember({ pool: pool!, orgId, clerkUserId, clerkOrgRole: 'org:member' });
		await new PostgresProjectMembershipRepository(pool!).upsert({ orgId, projectId, userId: member.userId, roleKey: 'pmo' });
		await withTransaction(pool!, async (client) => {
			const memberships = new PostgresOrgMembershipRepository(client);
			await memberships.lockOrganization(orgId);
			await memberships.markRemoved(orgId, member.userId);
		});

		expect(await syncClerkMember({ pool: pool!, orgId, clerkUserId, clerkOrgRole: 'org:member' })).toMatchObject({ status: 'removed' });

		const revived = await syncClerkMember({ pool: pool!, orgId, clerkUserId, clerkOrgRole: 'org:member', reactivateRemoved: true });
		expect(revived).toMatchObject({ status: 'active', orgRole: 'member', orgMembershipId: member.orgMembershipId });
		// Removal deleted the project grant; coming back does not resurrect it.
		expect(await new PostgresProjectMembershipRepository(pool!).findByProjectAndUser(projectId, member.userId)).toBeUndefined();
	});

	it('rolls the user row back when the organization does not exist', async (ctx) => {
		if (!available) return ctx.skip();
		const clerkUserId = clerkId();
		await expect(syncClerkMember({ pool: pool!, orgId: randomUUID(), clerkUserId, clerkOrgRole: 'org:member' })).rejects.toThrow(/does not exist/);
		expect(await new PostgresUserRepository(pool!).findByClerkId(clerkUserId)).toBeUndefined();
	});
});

describe('org memberships', () => {
	it('refuses to demote or remove the only active owner, and allows it once there is a second', async (ctx) => {
		if (!available) return ctx.skip();
		const soloOrg = randomUUID();
		await pool!.query('insert into organizations (id, name) values ($1, $2)', [soloOrg, `itest-solo-${soloOrg}`]);
		try {
			const memberships = new PostgresOrgMembershipRepository(pool!);
			const owner = await syncClerkMember({ pool: pool!, orgId: soloOrg, clerkUserId: clerkId(), clerkOrgRole: 'org:admin' });
			const second = await syncClerkMember({ pool: pool!, orgId: soloOrg, clerkUserId: clerkId(), clerkOrgRole: 'org:admin' });
			expect(owner.orgRole).toBe('owner');

			await expect(memberships.updateRole(soloOrg, owner.userId, 'admin')).rejects.toBeInstanceOf(LastOwnerError);
			await expect(memberships.markRemoved(soloOrg, owner.userId)).rejects.toBeInstanceOf(LastOwnerError);

			await memberships.updateRole(soloOrg, second.userId, 'owner');
			expect(await memberships.updateRole(soloOrg, owner.userId, 'admin')).toMatchObject({ roleKey: 'admin' });
		} finally {
			await pool!.query('delete from organizations where id = $1', [soloOrg]);
		}
	});

	it('rejects a role outside owner/admin/member at the database', async (ctx) => {
		if (!available) return ctx.skip();
		const { user } = await new PostgresUserRepository(pool!).upsertByClerkId(clerkId());
		await expect(pool!.query(`insert into org_memberships (org_id, user_id, role_key) values ($1, $2, 'superuser')`, [orgId, user.id])).rejects.toThrow(/check constraint/);
	});

	it('lists members with their profile, owners first, and leaves removed members out', async (ctx) => {
		if (!available) return ctx.skip();
		const listOrg = randomUUID();
		await pool!.query('insert into organizations (id, name) values ($1, $2)', [listOrg, `itest-list-${listOrg}`]);
		try {
			const memberships = new PostgresOrgMembershipRepository(pool!);
			const users = new PostgresUserRepository(pool!);
			const member = await syncClerkMember({ pool: pool!, orgId: listOrg, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });
			const owner = await syncClerkMember({ pool: pool!, orgId: listOrg, clerkUserId: clerkId(), clerkOrgRole: 'org:admin' });
			const leaver = await syncClerkMember({ pool: pool!, orgId: listOrg, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });
			await users.updateProfile(owner.userId, { displayName: 'Olive Owner', email: 'olive@acme.test' });
			await memberships.markRemoved(listOrg, leaver.userId);

			const listed = await memberships.listByOrg(listOrg);

			expect(listed.map((m) => m.userId)).toEqual([owner.userId, member.userId]);
			expect(listed[0]).toMatchObject({ roleKey: 'owner', displayName: 'Olive Owner', email: 'olive@acme.test' });
		} finally {
			await pool!.query('delete from organizations where id = $1', [listOrg]);
		}
	});
});

describe('project memberships', () => {
	it('cannot grant a project in one org to a member of another', async (ctx) => {
		if (!available) return ctx.skip();
		const projects = new PostgresProjectMembershipRepository(pool!);
		const outsider = await syncClerkMember({ pool: pool!, orgId: otherOrgId, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });

		// Claiming the project's real org: the user is not a member of it.
		await expect(projects.upsert({ orgId, projectId, userId: outsider.userId, roleKey: 'developer' })).rejects.toThrow(/foreign key/);
		// Claiming the user's org: the project does not belong to it.
		await expect(projects.upsert({ orgId: otherOrgId, projectId, userId: outsider.userId, roleKey: 'developer' })).rejects.toThrow(/foreign key/);
	});

	it('upsert tells a fresh grant from a role change, and removal cascades from the org membership', async (ctx) => {
		if (!available) return ctx.skip();
		const projects = new PostgresProjectMembershipRepository(pool!);
		const member = await syncClerkMember({ pool: pool!, orgId, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });

		const granted = await projects.upsert({ orgId, projectId, userId: member.userId, roleKey: 'viewer' });
		const changed = await projects.upsert({ orgId, projectId, userId: member.userId, roleKey: 'ba' });

		expect(granted.previousRoleKey).toBeUndefined();
		expect(changed.previousRoleKey).toBe('viewer');
		expect(changed.membership).toMatchObject({ id: granted.membership.id, roleKey: 'ba' });
		expect((await projects.listByProject(projectId)).some((m) => m.userId === member.userId)).toBe(true);

		await pool!.query('delete from org_memberships where org_id = $1 and user_id = $2', [orgId, member.userId]);
		expect(await projects.findByProjectAndUser(projectId, member.userId)).toBeUndefined();
	});

	it('rejects a malformed role key but accepts one the database has never heard of', async (ctx) => {
		if (!available) return ctx.skip();
		const projects = new PostgresProjectMembershipRepository(pool!);
		const member = await syncClerkMember({ pool: pool!, orgId, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });

		await expect(projects.upsert({ orgId, projectId, userId: member.userId, roleKey: 'Not A Role!' })).rejects.toThrow(/check constraint/);
		// The role catalog lives in code, so a new built-in role needs no migration.
		await expect(projects.upsert({ orgId, projectId, userId: member.userId, roleKey: 'release_manager' })).resolves.toBeDefined();
	});
});

describe('project creation with a creator', () => {
	const input = (id: string, org: string) =>
		({
			id,
			orgId: org,
			name: `creator ${id.slice(0, 8)}`,
			description: null,
			qdrantCollectionDocs: `proj_${id.replaceAll('-', '')}_documents`,
			qdrantCollectionCode: `proj_${id.replaceAll('-', '')}_code`,
			rocketrideDocsIngestPipelineId: randomUUID(),
			rocketrideCodeIngestPipelineId: randomUUID(),
			rocketrideChatPipelineId: randomUUID(),
			llmProfile: 'openai-5',
			embeddingProfile: 'openai-text-embedding-3-large',
		}) as const;

	it('writes the project and its creator membership in one statement', async (ctx) => {
		if (!available) return ctx.skip();
		const creator = await syncClerkMember({ pool: pool!, orgId, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });
		const id = randomUUID();

		const project = await new PostgresProjectRepository(pool!).create({ ...input(id, orgId), creator: { userId: creator.userId, roleKey: 'pmo' } });

		expect(project).toMatchObject({ createdByUserId: creator.userId, defaultMemberRoleKey: null });
		expect(await new PostgresProjectMembershipRepository(pool!).findByProjectAndUser(id, creator.userId)).toMatchObject({ roleKey: 'pmo', orgId, addedByUserId: creator.userId });
	});

	it('creates no project at all when the creator is not a member of the org', async (ctx) => {
		if (!available) return ctx.skip();
		const outsider = await syncClerkMember({ pool: pool!, orgId: otherOrgId, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });
		const id = randomUUID();

		await expect(new PostgresProjectRepository(pool!).create({ ...input(id, orgId), creator: { userId: outsider.userId, roleKey: 'pmo' } })).rejects.toThrow(/foreign key/);
		// A private project nobody can open must never be left behind.
		expect(await new PostgresProjectRepository(pool!).findById(id)).toBeUndefined();
	});

	it('a service key creates a project with no creator and no membership', async (ctx) => {
		if (!available) return ctx.skip();
		const id = randomUUID();
		const project = await new PostgresProjectRepository(pool!).create({ ...input(id, orgId), creator: null });
		expect(project.createdByUserId).toBeNull();
		expect(await new PostgresProjectMembershipRepository(pool!).listByProject(id)).toEqual([]);
	});
});

describe('projects after 0019', () => {
	it('new projects are private: no default member role', async (ctx) => {
		if (!available) return ctx.skip();
		const { rows } = await pool!.query<{ default_member_role_key: string | null }>('select default_member_role_key from projects where id = $1', [projectId]);
		expect(rows[0]?.default_member_role_key).toBeNull();
	});
});

describe('attribution', () => {
	it('a conversation outlives the person who started it, and keeps their messages', async (ctx) => {
		if (!available) return ctx.skip();
		const chats = new PostgresChatRepository(pool!);
		const users = new PostgresUserRepository(pool!);
		const { user } = await users.upsertByClerkId(clerkId());
		const chat = await chats.createChat({ id: randomUUID(), projectId, userId: user.id, title: 'attributed' });
		await chats.createMessage({ id: randomUUID(), chatId: chat.id, role: 'user', content: 'who decided this?', authorUserId: user.id });

		// 0001 cascaded here, deleting a thread the whole project shares.
		await pool!.query('delete from users where id = $1', [user.id]);

		expect(await chats.findChatById(chat.id)).toMatchObject({ id: chat.id, userId: null });
		expect(await chats.listMessages(chat.id)).toMatchObject([{ content: 'who decided this?', authorUserId: null }]);
	});

	it('persists a calibrated confidence and rejects a raw cosine or a percentage', async (ctx) => {
		if (!available) return ctx.skip();
		const chats = new PostgresChatRepository(pool!);
		const chat = await chats.createChat({ id: randomUUID(), projectId, title: 'confidence' });

		const saved = await chats.createMessage({ id: randomUUID(), chatId: chat.id, role: 'assistant', content: 'answer', confidence: 0.82 });
		expect(saved.confidence).toBeCloseTo(0.82, 5);
		expect((await chats.listMessages(chat.id))[0]?.confidence).toBeCloseTo(0.82, 5);

		await expect(chats.createMessage({ id: randomUUID(), chatId: chat.id, role: 'assistant', content: 'x', confidence: 82 })).rejects.toThrow(/check constraint/);
		await expect(chats.createMessage({ id: randomUUID(), chatId: chat.id, role: 'assistant', content: 'x', confidence: -0.1 })).rejects.toThrow(/check constraint/);
	});

	it('records the human actor on an audit row, inside the caller transaction', async (ctx) => {
		if (!available) return ctx.skip();
		const member = await syncClerkMember({ pool: pool!, orgId, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });
		const entry = { orgId, projectId, actorKeyId: null, action: 'project_member.added', resourceType: 'project_members', resourceId: projectId, ipAddress: null, metadata: { role: 'pmo' } };

		// A rolled-back change must not leave its domain event behind.
		await expect(
			withTransaction(pool!, async (client) => {
				await new PostgresAuditLogRepository(client).record({ ...entry, actorUserId: member.userId, actorType: 'user', category: 'domain' });
				throw new Error('change failed');
			})
		).rejects.toThrow('change failed');
		const afterRollback = await pool!.query('select 1 from audit_logs where org_id = $1 and category = $2', [orgId, 'domain']);
		expect(afterRollback.rowCount).toBe(0);

		await withTransaction(pool!, (client) => new PostgresAuditLogRepository(client).record({ ...entry, actorUserId: member.userId, actorType: 'user', category: 'domain' }));
		const { rows } = await pool!.query<{ actor_id: string; actor_type: string; category: string }>('select actor_id, actor_type, category from audit_logs where org_id = $1 and category = $2', [orgId, 'domain']);
		expect(rows).toEqual([{ actor_id: member.userId, actor_type: 'user', category: 'domain' }]);
	});

	it('every create path records who acted, and stays null when nobody did', async (ctx) => {
		if (!available) return ctx.skip();
		const member = await syncClerkMember({ pool: pool!, orgId, clerkUserId: clerkId(), clerkOrgRole: 'org:member' });
		const by = member.userId;

		const connectors = new PostgresKnowledgeConnectorRepository(pool!);
		const connector = await connectors.create({ id: randomUUID(), projectId, type: 'github', displayName: 'attributed', createdByUserId: by });
		const anonymous = await connectors.create({ id: randomUUID(), projectId, type: 'github', displayName: 'webhook-made' });
		expect(connector.createdByUserId).toBe(by);
		expect(anonymous.createdByUserId).toBeNull();

		const document = await new PostgresDocumentRepository(pool!).create({
			id: randomUUID(),
			projectId,
			connectorId: connector.id,
			sourceType: 'md',
			filename: `attributed-${randomUUID()}.md`,
			objectStorageKey: 'k',
			contentHash: randomUUID(),
			uploadedByUserId: by,
		});
		expect(document.uploadedByUserId).toBe(by);

		const repository = await new PostgresRepositoryRepository(pool!).create({ id: randomUUID(), projectId, connectorId: connector.id, source: 'zip', connectedByUserId: by } as never);
		expect(repository.connectedByUserId).toBe(by);

		const jobs = new PostgresPipelineJobRepository(pool!);
		const job = await jobs.create({ id: randomUUID(), projectId, jobType: 'ingest_document', payload: {}, triggeredByUserId: by });
		const deduped = await jobs.createDeduped({ id: randomUUID(), projectId, jobType: 'source_sync', payload: {}, dedupeKey: `itest:${randomUUID()}`, triggeredByUserId: by });
		expect(job.triggeredByUserId).toBe(by);
		expect(deduped.job.triggeredByUserId).toBe(by);

		// The OAuth state is the only server-controlled link between "start" and
		// "callback", so the person who started the flow is carried on it.
		const state = await new PostgresOAuthStateRepository(pool!).create({ stateHash: randomUUID(), orgId, provider: 'github', createdByUserId: by, expiresAt: new Date(Date.now() + 60_000) });
		expect(state.createdByUserId).toBe(by);
		const integration = await new PostgresIntegrationRepository(pool!).create({ orgId, provider: 'github', externalAccountId: `itest-${randomUUID()}`, connectedByUserId: state.createdByUserId });
		expect(integration.connectedByUserId).toBe(by);
	});

	it('an audit row written the old way defaults to the http category with no actor type', async (ctx) => {
		if (!available) return ctx.skip();
		await pool!.query(`insert into audit_logs (org_id, action, resource_type, resource_id) values ($1, 'POST /v1/projects', 'projects', 'legacy-writer')`, [orgId]);
		const { rows } = await pool!.query<{ category: string; actor_type: string | null }>(`select category, actor_type from audit_logs where org_id = $1 and resource_id = 'legacy-writer'`, [orgId]);
		expect(rows).toEqual([{ category: 'http', actor_type: null }]);
	});
});
