import type pg from 'pg';
import type { SlackWorkspace } from './slack-workspace.entity.js';
import type { CreateSlackWorkspaceInput, SlackWorkspaceRepository } from './slack-workspace.repository.js';

interface SlackWorkspaceRow {
	id: string;
	connector_id: string;
	project_id: string;
	integration_id: string | null;
	team_id: string;
	team_name: string | null;
	bot_user_id: string | null;
	scope: string | null;
	encrypted_access_token: string | null;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: SlackWorkspaceRow): SlackWorkspace {
	return {
		id: row.id,
		connectorId: row.connector_id,
		projectId: row.project_id,
		integrationId: row.integration_id,
		teamId: row.team_id,
		teamName: row.team_name,
		botUserId: row.bot_user_id,
		scope: row.scope,
		encryptedAccessToken: row.encrypted_access_token,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresSlackWorkspaceRepository implements SlackWorkspaceRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateSlackWorkspaceInput): Promise<SlackWorkspace> {
		const { rows } = await this.pool.query<SlackWorkspaceRow>(
			`insert into slack_workspaces (id, connector_id, project_id, integration_id, team_id, team_name, bot_user_id, scope, encrypted_access_token)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
			[
				input.id,
				input.connectorId,
				input.projectId,
				input.integrationId ?? null,
				input.teamId,
				input.teamName ?? null,
				input.botUserId ?? null,
				input.scope ?? null,
				input.encryptedAccessToken ?? null,
			]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into slack_workspaces returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<SlackWorkspace | undefined> {
		const { rows } = await this.pool.query<SlackWorkspaceRow>('select * from slack_workspaces where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByConnectorId(connectorId: string): Promise<SlackWorkspace | undefined> {
		const { rows } = await this.pool.query<SlackWorkspaceRow>('select * from slack_workspaces where connector_id = $1', [connectorId]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByProjectAndTeam(projectId: string, teamId: string): Promise<SlackWorkspace | undefined> {
		const { rows } = await this.pool.query<SlackWorkspaceRow>('select * from slack_workspaces where project_id = $1 and team_id = $2', [projectId, teamId]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listByProject(projectId: string): Promise<SlackWorkspace[]> {
		const { rows } = await this.pool.query<SlackWorkspaceRow>('select * from slack_workspaces where project_id = $1 order by created_at', [projectId]);
		return rows.map(toDomain);
	}

	async listByIntegrationId(integrationId: string): Promise<SlackWorkspace[]> {
		const { rows } = await this.pool.query<SlackWorkspaceRow>('select * from slack_workspaces where integration_id = $1 order by created_at', [integrationId]);
		return rows.map(toDomain);
	}

	async updateAccessToken(id: string, encryptedAccessToken: string, meta?: { scope?: string | null; botUserId?: string | null }): Promise<void> {
		await this.pool.query(
			`update slack_workspaces
			 set encrypted_access_token = $2,
			     scope = coalesce($3, scope),
			     bot_user_id = coalesce($4, bot_user_id),
			     updated_at = now()
			 where id = $1`,
			[id, encryptedAccessToken, meta?.scope ?? null, meta?.botUserId ?? null]
		);
	}

	async delete(id: string): Promise<void> {
		await this.pool.query('delete from slack_workspaces where id = $1', [id]);
	}
}
