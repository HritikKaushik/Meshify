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
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at,
	};
}

export class PostgresPipelineJobRepository implements PipelineJobRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreatePipelineJobInput): Promise<PipelineJob> {
		const { rows } = await this.pool.query<PipelineJobRow>(
			`insert into pipeline_jobs (id, project_id, job_type, payload) values ($1, $2, $3, $4) returning *`,
			[input.id, input.projectId, input.jobType, input.payload]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into pipeline_jobs returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<PipelineJob | undefined> {
		const { rows } = await this.pool.query<PipelineJobRow>('select * from pipeline_jobs where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async markRunning(id: string): Promise<void> {
		await this.pool.query("update pipeline_jobs set status = 'running', updated_at = now() where id = $1", [id]);
	}

	async markCompleted(id: string): Promise<void> {
		await this.pool.query("update pipeline_jobs set status = 'completed', updated_at = now(), completed_at = now() where id = $1", [id]);
	}

	async markFailed(id: string, error: string, nextStatus: 'failed' | 'dead_letter'): Promise<void> {
		await this.pool.query('update pipeline_jobs set status = $2, last_error = $3, updated_at = now() where id = $1', [id, nextStatus, error]);
	}

	async incrementAttempts(id: string): Promise<number> {
		const { rows } = await this.pool.query<{ attempts: number }>('update pipeline_jobs set attempts = attempts + 1, updated_at = now() where id = $1 returning attempts', [id]);
		return rows[0]?.attempts ?? 0;
	}
}
