import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PipelineRunSnapshot, PipelineRunTraceInput } from './pipeline-run.entity.js';
import type { PipelineRunRepository } from './pipeline-run.repository.js';

export class PostgresPipelineRunRepository implements PipelineRunRepository {
	constructor(private readonly pool: pg.Pool) {}

	async upsertFromSnapshot(snapshot: PipelineRunSnapshot): Promise<string> {
		const { rows } = await this.pool.query<{ id: string }>(
			`insert into pipeline_runs (
				id, run_key, project_id, source, name, state, status, completed,
				started_at, ended_at, tokens_total, cost_usd,
				cpu_percent, cpu_memory_mb, gpu_memory_mb, error_count, updated_at
			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
			on conflict (run_key) do update set
				name = excluded.name, state = excluded.state, status = excluded.status,
				completed = excluded.completed, ended_at = coalesce(excluded.ended_at, pipeline_runs.ended_at),
				tokens_total = excluded.tokens_total, cost_usd = excluded.cost_usd,
				cpu_percent = excluded.cpu_percent, cpu_memory_mb = excluded.cpu_memory_mb,
				gpu_memory_mb = excluded.gpu_memory_mb, error_count = excluded.error_count, updated_at = now()
			returning id`,
			[
				randomUUID(),
				snapshot.runKey,
				snapshot.projectId,
				snapshot.source,
				snapshot.name,
				snapshot.state,
				snapshot.status,
				snapshot.completed,
				snapshot.startedAt,
				snapshot.endedAt,
				snapshot.tokensTotal,
				snapshot.costUsd,
				snapshot.cpuPercent,
				snapshot.cpuMemoryMb,
				snapshot.gpuMemoryMb,
				snapshot.errorCount,
			]
		);
		return rows[0]!.id;
	}

	async markEnded(projectId: string, source: string, endedAt: Date): Promise<string | undefined> {
		const { rows } = await this.pool.query<{ id: string }>(
			`update pipeline_runs set completed = true, ended_at = $3, updated_at = now()
			 where id = (
				select id from pipeline_runs
				where project_id = $1 and source = $2 and completed = false
				order by started_at desc nulls last, updated_at desc limit 1
			 ) returning id`,
			[projectId, source, endedAt]
		);
		return rows[0]?.id;
	}

	async ensureRunForTrace(projectId: string, source: string): Promise<string> {
		const found = await this.pool.query<{ id: string }>(
			'select id from pipeline_runs where project_id = $1 and source = $2 order by updated_at desc limit 1',
			[projectId, source]
		);
		if (found.rows[0]) return found.rows[0].id;

		// Trace arrived before any status snapshot seeded a run — create a placeholder.
		const id = randomUUID();
		await this.pool.query(
			`insert into pipeline_runs (id, run_key, project_id, source, state, completed)
			 values ($1, $2, $3, $4, 0, false) on conflict (run_key) do nothing`,
			[id, `${projectId}:${source}:placeholder-${id}`, projectId, source]
		);
		return id;
	}

	async appendTrace(input: PipelineRunTraceInput): Promise<void> {
		await this.pool.query(
			'insert into pipeline_run_traces (run_id, pipe_id, op, component, trace, seq) values ($1, $2, $3, $4, $5, $6)',
			[input.runId, input.pipeId, input.op, input.component, JSON.stringify(input.trace), input.seq]
		);
	}
}
