import { tokensToUsd, type PipelineRunRepository, type PipelineRunSnapshot } from '@meshify/data-access';

/** Minimal shape of a DAP event we care about (rocketride DAPMessage subset). */
export interface DapEvent {
	event?: string;
	body?: Record<string, unknown>;
	seq?: number;
}

interface Logger {
	warn(obj: Record<string, unknown>, msg: string): void;
}

function str(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** apaevt_task uses camelCase (projectId); status/flow use snake (project_id). Accept both. */
function projectId(body: Record<string, unknown>): string | undefined {
	return str(body.projectId) ?? str(body.project_id);
}
function unixToDate(seconds: unknown): Date | null {
	const n = num(seconds);
	return n && n > 0 ? new Date(n * 1000) : null;
}

/**
 * Translates RocketRide DAP events into pipeline-run persistence. Pure aside
 * from the injected repository, so the full mapping is unit-testable without a
 * live WebSocket. Unknown/malformed events are ignored (best-effort ingestion).
 */
export class DapEventHandler {
	constructor(
		private readonly runs: PipelineRunRepository,
		private readonly logger: Logger
	) {}

	async handle(event: DapEvent): Promise<void> {
		const body = event.body;
		if (!body) return;

		try {
			switch (event.event) {
				case 'apaevt_status_update':
					await this.handleStatus(body);
					break;
				case 'apaevt_task':
					await this.handleTask(body);
					break;
				case 'apaevt_flow':
					await this.handleFlow(body, event.seq);
					break;
				case 'apaevt_sse':
					await this.handlePassthrough(body, 'sse', event.seq);
					break;
				case 'output':
					await this.handlePassthrough(body, 'output', event.seq);
					break;
				default:
					break; // task 'running' snapshots, dashboard, billing, etc. — not persisted here
			}
		} catch (err) {
			this.logger.warn({ event: event.event, err: err instanceof Error ? err.message : String(err) }, 'failed to ingest DAP event');
		}
	}

	private async handleStatus(body: Record<string, unknown>): Promise<void> {
		const pid = projectId(body);
		const source = str(body.source);
		if (!pid || !source) return;

		const startedAt = unixToDate(body.startTime);
		const runKey = `${pid}:${source}:${startedAt ? startedAt.getTime() : 'nostart'}`;

		const tokens = (body.tokens as Record<string, unknown> | undefined) ?? {};
		const metrics = (body.metrics as Record<string, unknown> | undefined) ?? {};
		const tokensTotal = num(tokens.total) ?? null;
		const errors = Array.isArray(body.errors) ? body.errors.length : 0;

		const snapshot: PipelineRunSnapshot = {
			runKey,
			projectId: pid,
			source,
			name: str(body.name) ?? null,
			state: num(body.state) ?? 0,
			status: str(body.status) ?? null,
			completed: body.completed === true,
			startedAt,
			endedAt: unixToDate(body.endTime),
			tokensTotal,
			costUsd: tokensTotal !== null ? tokensToUsd(tokensTotal) : null,
			cpuPercent: num(metrics.cpu_percent) ?? null,
			cpuMemoryMb: num(metrics.cpu_memory_mb) ?? null,
			gpuMemoryMb: num(metrics.gpu_memory_mb) ?? null,
			errorCount: errors,
		};

		await this.runs.upsertFromSnapshot(snapshot);
	}

	private async handleTask(body: Record<string, unknown>): Promise<void> {
		if (body.action !== 'end') return; // begin/running are seeded by the first status snapshot
		const pid = projectId(body);
		const source = str(body.source);
		if (!pid || !source) return;
		await this.runs.markEnded(pid, source, new Date());
	}

	private async handleFlow(body: Record<string, unknown>, seq?: number): Promise<void> {
		const pid = projectId(body);
		const source = str(body.source);
		if (!pid || !source) return;

		const runId = await this.runs.ensureRunForTrace(pid, source);
		await this.runs.appendTrace({
			runId,
			pipeId: num(body.id) ?? 0,
			op: str(body.op) ?? 'unknown',
			component: str(body.component) ?? null,
			trace: (body.trace as Record<string, unknown> | undefined) ?? {},
			seq: seq ?? 0,
		});
	}

	private async handlePassthrough(body: Record<string, unknown>, op: 'output' | 'sse', seq?: number): Promise<void> {
		const pid = projectId(body);
		const source = str(body.source);
		// output/sse events don't always carry project/source; only persist when correlatable.
		if (!pid || !source) return;

		const runId = await this.runs.ensureRunForTrace(pid, source);
		await this.runs.appendTrace({
			runId,
			pipeId: num(body.pipe_id) ?? 0,
			op,
			component: null,
			trace: body,
			seq: seq ?? 0,
		});
	}
}
