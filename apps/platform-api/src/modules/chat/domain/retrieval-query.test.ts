import { describe, expect, it } from 'vitest';
import { buildRetrievalQueries, calibrateConfidence } from './retrieval-query.js';

describe('buildRetrievalQueries', () => {
	it('retrieves the question alone when there is no history', () => {
		expect(buildRetrievalQueries('How are refunds processed?')).toEqual(['How are refunds processed?']);
	});

	it('adds the previous user turn for a follow-up that leans on it', () => {
		const history = [
			{ role: 'user' as const, content: 'How are refunds processed?' },
			{ role: 'assistant' as const, content: 'Refunds are processed within 5 days.' },
		];
		expect(buildRetrievalQueries('Why does it take that long?', history)).toEqual(['Why does it take that long?', 'How are refunds processed?\nWhy does it take that long?']);
		expect(buildRetrievalQueries('And for EU customers?', history)).toHaveLength(2); // short follow-up
	});

	it('keeps a self-contained question on its own even with history', () => {
		const history = [{ role: 'user' as const, content: 'How are refunds processed?' }];
		expect(buildRetrievalQueries('Where is the deployment runbook for the worker service kept?', history)).toEqual(['Where is the deployment runbook for the worker service kept?']);
	});
});

describe('calibrateConfidence', () => {
	it('maps the retrieval floor to 0 and a strong score to 1', () => {
		expect(calibrateConfidence([0.25], { floor: 0.25, strong: 0.6 })).toBe(0);
		expect(calibrateConfidence([0.6], { floor: 0.25, strong: 0.6 })).toBe(1);
		expect(calibrateConfidence([0.91], { floor: 0.25, strong: 0.6 })).toBe(1);
	});

	it('is 0 without context and slightly higher when a second chunk agrees', () => {
		expect(calibrateConfidence([], { floor: 0.25 })).toBe(0);
		const alone = calibrateConfidence([0.45], { floor: 0.25, strong: 0.6 });
		const supported = calibrateConfidence([0.45, 0.44], { floor: 0.25, strong: 0.6 });
		expect(supported).toBeGreaterThan(alone * 0.8);
		expect(supported).toBeLessThanOrEqual(1);
	});
});
