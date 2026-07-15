import { describe, expect, it } from 'vitest';
import { JOB_EVENTS_CHANNEL, JobEventSubscriber, type JobEvent } from '@meshify/queues';
import { JobEventHub } from './job-event-hub.js';

/** A fake Redis subscriber connection that lets the test emit channel messages. */
function fakeSubscriber() {
	let handler: (channel: string, message: string) => void = () => {};
	const conn = {
		subscribe: async () => 1,
		on: (_event: 'message', cb: (channel: string, message: string) => void) => {
			handler = cb;
		},
	};
	return { subscriber: new JobEventSubscriber(conn), emit: (event: JobEvent) => handler(JOB_EVENTS_CHANNEL, JSON.stringify(event)) };
}

function event(projectId: string, jobId = 'j1'): JobEvent {
	return { jobId, projectId, jobType: 'clone_repo', title: 'repo', phase: 'progress', percent: 50, at: '2026-01-01T00:00:00.000Z' };
}

describe('JobEventHub', () => {
	it('fans events out only to subscribers of the matching project (isolation)', async () => {
		const { subscriber, emit } = fakeSubscriber();
		const hub = new JobEventHub(subscriber);
		await hub.start();

		const projA: JobEvent[] = [];
		const projB: JobEvent[] = [];
		hub.subscribe('proj-a', (e) => projA.push(e));
		hub.subscribe('proj-b', (e) => projB.push(e));

		emit(event('proj-a'));
		emit(event('proj-b'));
		emit(event('proj-a', 'j2'));

		expect(projA.map((e) => e.jobId)).toEqual(['j1', 'j2']);
		expect(projB.map((e) => e.jobId)).toEqual(['j1']);
	});

	it('stops delivering after unsubscribe', async () => {
		const { subscriber, emit } = fakeSubscriber();
		const hub = new JobEventHub(subscriber);
		await hub.start();

		const received: JobEvent[] = [];
		const unsubscribe = hub.subscribe('proj-a', (e) => received.push(e));
		emit(event('proj-a'));
		unsubscribe();
		emit(event('proj-a', 'j2'));

		expect(received.map((e) => e.jobId)).toEqual(['j1']);
	});

	it('one throwing listener does not break delivery to others', async () => {
		const { subscriber, emit } = fakeSubscriber();
		const hub = new JobEventHub(subscriber);
		await hub.start();

		const good: JobEvent[] = [];
		hub.subscribe('proj-a', () => {
			throw new Error('boom');
		});
		hub.subscribe('proj-a', (e) => good.push(e));
		emit(event('proj-a'));

		expect(good).toHaveLength(1);
	});
});
