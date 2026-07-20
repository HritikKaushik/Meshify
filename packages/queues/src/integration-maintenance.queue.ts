import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

/**
 * Repeating platform upkeep, driven by BullMQ Job Schedulers the worker
 * upserts at boot. Three cadences, one processor (dispatch by job name):
 *
 *   refresh    (15 min) — rotate expiring credentials + run due/stale syncs
 *   health     (1 h)    — provider health sweep, health.changed on transitions
 *   retention  (24 h)   — prune terminal webhook events + expired OAuth states
 *
 * Maintenance work is platform-scoped (no project), so it deliberately does
 * NOT create pipeline_jobs rows or appear in the Job Progress Center.
 */
export const INTEGRATION_MAINTENANCE_QUEUE = 'integration-maintenance';

export type MaintenanceTask = 'refresh' | 'health' | 'retention';

export interface IntegrationMaintenanceJobPayload {
	task: MaintenanceTask;
}

export const MAINTENANCE_SCHEDULES: ReadonlyArray<{ task: MaintenanceTask; everyMs: number }> = [
	{ task: 'refresh', everyMs: 15 * 60 * 1000 },
	{ task: 'health', everyMs: 60 * 60 * 1000 },
	{ task: 'retention', everyMs: 24 * 60 * 60 * 1000 },
];

export function createIntegrationMaintenanceQueue(connection: ConnectionOptions): Queue<IntegrationMaintenanceJobPayload> {
	// No retries: every task is a sweep that the next scheduled run repeats anyway.
	return new Queue<IntegrationMaintenanceJobPayload>(INTEGRATION_MAINTENANCE_QUEUE, {
		connection,
		defaultJobOptions: { attempts: 1, removeOnComplete: { age: 24 * 60 * 60 }, removeOnFail: { age: 24 * 60 * 60 } },
	});
}
