import { describe, expect, it } from 'vitest';
import type { JobEvent } from '@/api';
import { initialJobsState, jobsReducer } from './job-model';

const event = (over: Partial<JobEvent>): JobEvent =>
	({ jobId: 'j1', jobType: 'ingest_document', title: 'Doc', phase: 'running', at: '2026-09-04T00:00:00.000Z', ...over }) as JobEvent;

describe('jobsReducer', () => {
	it('seeds active jobs and terminal history from a snapshot, then folds live events in', () => {
		let state = jobsReducer(initialJobsState, { type: 'snapshot', active: [event({ jobId: 'j1' })], recent: [event({ jobId: 'old', phase: 'completed' })] });
		expect(Object.keys(state.active)).toEqual(['j1']);
		expect(state.history.map((h) => h.jobId)).toEqual(['old']);

		state = jobsReducer(state, { type: 'event', event: event({ jobId: 'j1', phase: 'running', stage: 'Embedding', percent: 40 }) });
		expect(state.active.j1).toMatchObject({ stage: 'Embedding', percent: 40 });

		state = jobsReducer(state, { type: 'event', event: event({ jobId: 'j1', phase: 'completed', percent: 100 }) });
		state = jobsReducer(state, { type: 'archive', jobId: 'j1' });
		expect(state.active.j1).toBeUndefined();
		expect(state.history[0]?.jobId).toBe('j1');
	});

	it('a re-seed after a reconnect does not duplicate jobs it already knows', () => {
		let state = jobsReducer(initialJobsState, { type: 'snapshot', active: [event({ jobId: 'j1' })], recent: [event({ jobId: 'old', phase: 'completed' })] });
		state = jobsReducer(state, { type: 'snapshot', active: [event({ jobId: 'j1', stage: 'Later' })], recent: [event({ jobId: 'old', phase: 'completed' })] });
		expect(Object.keys(state.active)).toEqual(['j1']);
		expect(state.active.j1?.stage).toBe('Later');
		expect(state.history.filter((h) => h.jobId === 'old')).toHaveLength(1);
	});
});
