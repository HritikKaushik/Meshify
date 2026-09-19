import type { Queryable } from '../db/queryable.js';
import type { ProjectMember, ProjectMembership } from './project-membership.entity.js';
import type { ProjectMembershipRepository, UpsertProjectMembershipInput } from './project-membership.repository.js';

interface ProjectMembershipRow {
	id: string;
	org_id: string;
	project_id: string;
	user_id: string;
	role_key: string;
	added_by_user_id: string | null;
	created_at: Date;
	updated_at: Date;
}

interface ProjectMemberRow extends ProjectMembershipRow {
	email: string | null;
	display_name: string | null;
	avatar_url: string | null;
}

const COLUMNS = 'id, org_id, project_id, user_id, role_key, added_by_user_id, created_at, updated_at';

function toDomain(row: ProjectMembershipRow): ProjectMembership {
	return {
		id: row.id,
		orgId: row.org_id,
		projectId: row.project_id,
		userId: row.user_id,
		roleKey: row.role_key,
		addedByUserId: row.added_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresProjectMembershipRepository implements ProjectMembershipRepository {
	constructor(private readonly pool: Queryable) {}

	async findByProjectAndUser(projectId: string, userId: string): Promise<ProjectMembership | undefined> {
		const { rows } = await this.pool.query<ProjectMembershipRow>(`select ${COLUMNS} from project_memberships where project_id = $1 and user_id = $2`, [projectId, userId]);
		return rows[0] ? toDomain(rows[0]) : undefined;
	}

	async listByProject(projectId: string): Promise<ProjectMember[]> {
		const { rows } = await this.pool.query<ProjectMemberRow>(
			`select m.id, m.org_id, m.project_id, m.user_id, m.role_key, m.added_by_user_id, m.created_at, m.updated_at,
				u.email, u.display_name, u.avatar_url
			 from project_memberships m
			 join users u on u.id = m.user_id
			 where m.project_id = $1
			 order by lower(coalesce(u.display_name, u.email, '')), m.created_at`,
			[projectId]
		);
		return rows.map((row) => ({ ...toDomain(row), email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url }));
	}

	async upsert(input: UpsertProjectMembershipInput): Promise<{ membership: ProjectMembership; previousRoleKey: string | undefined }> {
		// The CTE reads the old role in the same statement as the write, so
		// "added" vs "role changed" cannot be misreported under concurrency.
		const { rows } = await this.pool.query<ProjectMembershipRow & { previous_role_key: string | null }>(
			`with previous as (
				select role_key from project_memberships where project_id = $2 and user_id = $3
			 ), written as (
				insert into project_memberships (org_id, project_id, user_id, role_key, added_by_user_id)
				values ($1, $2, $3, $4, $5)
				on conflict (project_id, user_id) do update set role_key = excluded.role_key, updated_at = now()
				returning ${COLUMNS}
			 )
			 select written.*, (select role_key from previous) as previous_role_key from written`,
			[input.orgId, input.projectId, input.userId, input.roleKey, input.addedByUserId ?? null]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into project_memberships returned no row');
		return { membership: toDomain(row), previousRoleKey: row.previous_role_key ?? undefined };
	}

	async remove(projectId: string, userId: string): Promise<ProjectMembership | undefined> {
		const { rows } = await this.pool.query<ProjectMembershipRow>(`delete from project_memberships where project_id = $1 and user_id = $2 returning ${COLUMNS}`, [projectId, userId]);
		return rows[0] ? toDomain(rows[0]) : undefined;
	}
}
