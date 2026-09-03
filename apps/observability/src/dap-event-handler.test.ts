import { describe, expect, it } from 'vitest';
import type { PipelineRunRepository, PipelineRunSnapshot, PipelineRunTraceInput } from '@meshify/data-access';
import { DapEventHandler } from './dap-event-handler.js';

function fakeRepo() {
	const snapshots: PipelineRunSnapshot[] = [];
	const ended: Array<{ projectId: string; source: string }> = [];
	const traces: PipelineRunTraceInput[] = [];
	const repo: PipelineRunRepository = {
		deleteEndedBefore: async () => 0,
		async upsertFromSnapshot(s) {
			snapshots.push(s);
			return 'run-1';
		},
		async markEnded(projectId, source) {
			ended.push({ projectId, source });
			return 'run-1';
		},
		async ensureRunForTrace() {
			return 'run-1';
		},
		async appendTrace(t) {
			traces.push(t);
		},
	};
	return { repo, snapshots, ended, traces };
}

const noopLogger = { warn: () => {} };

describe('DapEventHandler', () => {
	it('maps a status_update into a run snapshot with cost derived from tokens (100 tokens = $1)', async () => {
		const { repo, snapshots } = fakeRepo();
		const handler = new DapEventHandler(repo, noopLogger);

		await handler.handle({
			event: 'apaevt_status_update',
			body: {
				name: 'Ingest',
				project_id: 'p1',
				source: 'webhook_1',
				state: 3,
				status: 'running',
				completed: false,
				startTime: 1_700_000_000,
				tokens: { total: 250 },
				metrics: { cpu_percent: 42, cpu_memory_mb: 512 },
				errors: ['boom'],
			},
		});

		expect(snapshots).toHaveLength(1);
		const s = snapshots[0]!;
		expect(s.runKey).toBe(`p1:webhook_1:${1_700_000_000 * 1000}`);
		expect(s.tokensTotal).toBe(250);
		expect(s.costUsd).toBe(2.5);
		expect(s.cpuPercent).toBe(42);
		expect(s.errorCount).toBe(1);
		expect(s.startedAt?.getTime()).toBe(1_700_000_000 * 1000);
	});

	it('accepts camelCase projectId on task events and marks ended only on action=end', async () => {
		const { repo, ended } = fakeRepo();
		const handler = new DapEventHandler(repo, noopLogger);

		await handler.handle({ event: 'apaevt_task', body: { action: 'begin', projectId: 'p1', source: 'chat_1' } });
		expect(ended).toHaveLength(0);

		await handler.handle({ event: 'apaevt_task', body: { action: 'end', projectId: 'p1', source: 'chat_1' } });
		expect(ended).toEqual([{ projectId: 'p1', source: 'chat_1' }]);
	});

	it('appends a flow trace correlated to the run', async () => {
		const { repo, traces } = fakeRepo();
		const handler = new DapEventHandler(repo, noopLogger);

		await handler.handle({
			event: 'apaevt_flow',
			seq: 77,
			body: { id: 2, op: 'leave', component: 'embedding_1', trace: { lane: 'documents' }, project_id: 'p1', source: 'webhook_1' },
		});

		expect(traces).toEqual([{ runId: 'run-1', pipeId: 2, op: 'leave', component: 'embedding_1', trace: { lane: 'documents' }, seq: 77 }]);
	});

	it('ignores events without project/source and never throws on malformed bodies', async () => {
		const { repo, snapshots, traces } = fakeRepo();
		const handler = new DapEventHandler(repo, noopLogger);

		await handler.handle({ event: 'apaevt_status_update', body: { state: 3 } }); // no project/source
		await handler.handle({ event: 'apaevt_flow', body: {} });
		await handler.handle({ event: 'output', body: { output: 'log line with no correlation' } });
		await handler.handle({ event: 'unknown_event', body: { x: 1 } });
		await handler.handle({}); // no body

		expect(snapshots).toHaveLength(0);
		expect(traces).toHaveLength(0);
	});
});
