import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_OPTS, retryEnvelopeMs } from './job-options.js';

describe('DEFAULT_JOB_OPTS', () => {
	it('retries for at least ten minutes before dead-lettering', () => {
		// A transient outage (engine restart, Redis failover) typically clears
		// within a few minutes; the envelope must comfortably exceed that.
		expect(retryEnvelopeMs()).toBeGreaterThanOrEqual(10 * 60 * 1000);
		expect(retryEnvelopeMs()).toBe(30_000 + 60_000 + 120_000 + 240_000 + 480_000);
	});

	it('bounds the dead-letter set instead of keeping failed jobs forever', () => {
		expect(DEFAULT_JOB_OPTS.removeOnFail).toEqual({ age: 30 * 24 * 60 * 60 });
		expect(DEFAULT_JOB_OPTS.removeOnComplete).toEqual({ age: 24 * 60 * 60 });
	});
});
