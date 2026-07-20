import type pg from 'pg';
import type { PipelineJob, PipelineJobStatus, PipelineJobType } from './pipeline-job.entity.js';
import type { CreatePipelineJobInput, PipelineJobRepository } from './pipeline-job.repository.js';

interface PipelineJobRow {
	id: string;
	project_id: string;
	job_type: string;
	status: string;
	rocketride_token: string | null;
	attempts: number;
	last_error: string | null;
	payload: Record<string, unknown>;
	dedupe_key: string | null;
	progress: number | null;
	stage: string | null;
	created_at: Date;
	updated_at: Date;
	completed_at: Date | null;
}

function toDomain(row: PipelineJobRow): PipelineJob {
	return {
		id: row.id,
		projectId: row.project_id,
		jobType: row.job_type as PipelineJobType,
		status: row.status as PipelineJobStatus,
		rocketrideToken: row.rocketride_token,
		attempts: row.attempts,
		lastError: row.last_error,
		payload: row.payload,
		dedupeKey: row.dedupe_key,
		progress: row.progress,
		stage: row.stage,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at,
	};
}

export class PostgresPipelineJobRepository implements PipelineJobRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreatePipelineJobInput): Promise<PipelineJob> {
		const { rows } = await this.pool.query<PipelineJobRow>(
			`insert into pipeline_jobs (id, project_id, job_type, payload, dedupe_key) values ($1, $2, $3, $4, $5) returning *`,
			[input.id, input.projectId, input.jobType, input.payload, input.dedupeKey ?? null]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into pipeline_jobs returned no row');
		return toDomain(row);
	}

	async createDeduped(input: CreatePipelineJobInput & { dedupeKey: string }): Promise<{ job: PipelineJob; created: boolean }> {
		// Conflict target matches the partial unique index on (dedupe_key) where status = 'queued'.
		const { rows } = await this.pool.query<PipelineJobRow>(
			`insert into pipeline_jobs (id, project_id, job_type, payload, dedupe_key)
			 values ($1, $2, $3, $4, $5)
			 on conflict (dedupe_key) where status = 'queued' do nothing
			 returning *`,
			[input.id, input.projectId, input.jobType, input.payload, input.dedupeKey]
		);
		const row = rows[0];
		if (row) return { job: toDomain(row), created: true };
		const { rows: existing } = await this.pool.query<PipelineJobRow>(
			`select * from pipeline_jobs where dedupe_key = $1 and status = 'queued'`,
			[input.dedupeKey]
		);
		const survivor = existing[0];
		if (!survivor) throw new Error(`Deduped pipeline job insert conflicted but no queued job found for key "${input.dedupeKey}"`);
		return { job: toDomain(survivor), created: false };
	}

	async findById(id: string): Promise<PipelineJob | undefined> {
		const { rows } = await this.pool.query<PipelineJobRow>('select * from pipeline_jobs where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByIdForOrg(id: string, orgId: string): Promise<PipelineJob | undefined> {
		const { rows } = await this.pool.query<PipelineJobRow>(
			`select j.* from pipeline_jobs j
			 join projects p on p.id = j.project_id
			 where j.id = $1 and p.org_id = $2`,
			[id, orgId]
		);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async listActiveByProject(projectId: string): Promise<PipelineJob[]> {
		const { rows } = await this.pool.query<PipelineJobRow>(
			"select * from pipeline_jobs where project_id = $1 and status in ('queued', 'running') order by created_at",
			[projectId]
		);
		return rows.map(toDomain);
	}

	async listRecentByProject(projectId: string, limit: number): Promise<PipelineJob[]> {
		const { rows } = await this.pool.query<PipelineJobRow>('select * from pipeline_jobs where project_id = $1 order by updated_at desc limit $2', [projectId, limit]);
		return rows.map(toDomain);
	}

	async listStuckQueued(before: Date): Promise<PipelineJob[]> {
		const { rows } = await this.pool.query<PipelineJobRow>("select * from pipeline_jobs where status = 'queued' and created_at < $1 order by created_at limit 500", [before]);
		return rows.map(toDomain);
	}

	async markRunning(id: string): Promise<void> {
		await this.pool.query("update pipeline_jobs set status = 'running', progress = coalesce(progress, 0), updated_at = now() where id = $1", [id]);
	}

	async updateProgress(id: string, progress: { stage: string; percent: number }): Promise<void> {
		// Clamp to [0,100]; a running job that reports 100% is still "running" until markCompleted.
		const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
		await this.pool.query('update pipeline_jobs set stage = $2, progress = $3, updated_at = now() where id = $1', [id, progress.stage, percent]);
	}

	async markCompleted(id: string): Promise<void> {
		await this.pool.query("update pipeline_jobs set status = 'completed', progress = 100, updated_at = now(), completed_at = now() where id = $1", [id]);
	}

	async markFailed(id: string, error: string, nextStatus: 'failed' | 'dead_letter'): Promise<void> {
		await this.pool.query('update pipeline_jobs set status = $2, last_error = $3, updated_at = now() where id = $1', [id, nextStatus, error]);
	}

	async incrementAttempts(id: string): Promise<number> {
		const { rows } = await this.pool.query<{ attempts: number }>('update pipeline_jobs set attempts = attempts + 1, updated_at = now() where id = $1 returning attempts', [id]);
		return rows[0]?.attempts ?? 0;
	}
}
