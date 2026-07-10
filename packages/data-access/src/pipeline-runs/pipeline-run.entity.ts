export interface PipelineRunSnapshot {
	runKey: string;
	projectId: string;
	source: string;
	name: string | null;
	state: number;
	status: string | null;
	completed: boolean;
	startedAt: Date | null;
	endedAt: Date | null;
	tokensTotal: number | null;
	costUsd: number | null;
	cpuPercent: number | null;
	cpuMemoryMb: number | null;
	gpuMemoryMb: number | null;
	errorCount: number;
}

export interface PipelineRunTraceInput {
	runId: string;
	pipeId: number;
	op: string;
	component: string | null;
	trace: Record<string, unknown>;
	seq: number;
}

/** RocketRide bills at 100 tokens = $1 (see ROCKETRIDE_OBSERVABILITY.md §5.2). */
export function tokensToUsd(tokensTotal: number): number {
	return tokensTotal / 100;
}
