import type pg from 'pg';
import type { Project } from './project.entity.js';
import type { CreateProjectInput, ProjectRepository } from './project.repository.js';

interface ProjectRow {
	id: string;
	org_id: string;
	name: string;
	description: string | null;
	status: string;
	llm_profile: string;
	embedding_profile: string;
	qdrant_collection_docs: string;
	qdrant_collection_code: string;
	rocketride_docs_ingest_pipeline_id: string;
	rocketride_code_ingest_pipeline_id: string;
	rocketride_chat_pipeline_id: string;
	default_member_role_key: string | null;
	created_by_user_id: string | null;
	created_at: Date;
	updated_at: Date;
	deleted_at: Date | null;
}

function toDomain(row: ProjectRow): Project {
	return {
		id: row.id,
		orgId: row.org_id,
		name: row.name,
		description: row.description,
		status: row.status as Project['status'],
		llmProfile: row.llm_profile,
		embeddingProfile: row.embedding_profile,
		qdrantCollectionDocs: row.qdrant_collection_docs,
		qdrantCollectionCode: row.qdrant_collection_code,
		rocketrideDocsIngestPipelineId: row.rocketride_docs_ingest_pipeline_id,
		rocketrideCodeIngestPipelineId: row.rocketride_code_ingest_pipeline_id,
		rocketrideChatPipelineId: row.rocketride_chat_pipeline_id,
		defaultMemberRoleKey: row.default_member_role_key,
		createdByUserId: row.created_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		deletedAt: row.deleted_at,
	};
}

export class PostgresProjectRepository implements ProjectRepository {
	constructor(private readonly pool: pg.Pool) {}

	async orgExists(orgId: string): Promise<boolean> {
		const { rows } = await this.pool.query('select 1 from organizations where id = $1', [orgId]);
		return rows.length > 0;
	}

	async create(input: CreateProjectInput): Promise<Project> {
		// One statement, so the project and its creator's membership commit or fail
		// together: a new project is private, and a private project with no member
		// would be unreachable by the person who just made it. The membership's
		// foreign keys are checked at the end of the statement, after both inserts.
		const { rows } = await this.pool.query<ProjectRow>(
			`with created as (
				insert into projects (
					id, org_id, name, description, llm_profile, embedding_profile,
					qdrant_collection_docs, qdrant_collection_code,
					rocketride_docs_ingest_pipeline_id, rocketride_code_ingest_pipeline_id, rocketride_chat_pipeline_id,
					created_by_user_id
				) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
				returning *
			), membership as (
				insert into project_memberships (org_id, project_id, user_id, role_key, added_by_user_id)
				select created.org_id, created.id, $12, $13, $12 from created where $12::uuid is not null and $13::text is not null
			)
			select * from created`,
			[
				input.id,
				input.orgId,
				input.name,
				input.description,
				input.llmProfile,
				input.embeddingProfile,
				input.qdrantCollectionDocs,
				input.qdrantCollectionCode,
				input.rocketrideDocsIngestPipelineId,
				input.rocketrideCodeIngestPipelineId,
				input.rocketrideChatPipelineId,
				input.creator?.userId ?? null,
				input.creator?.roleKey ?? null,
			]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into projects returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<Project | undefined> {
		const { rows } = await this.pool.query<ProjectRow>('select * from projects where id = $1 and deleted_at is null', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByOrgId(orgId: string): Promise<Project[]> {
		const { rows } = await this.pool.query<ProjectRow>(
			'select * from projects where org_id = $1 and deleted_at is null order by created_at desc',
			[orgId]
		);
		return rows.map(toDomain);
	}

	async listAll(): Promise<Project[]> {
		const { rows } = await this.pool.query<ProjectRow>('select * from projects where deleted_at is null order by created_at');
		return rows.map(toDomain);
	}

	async delete(id: string): Promise<void> {
		await this.pool.query('delete from projects where id = $1', [id]);
	}
}
