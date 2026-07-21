import { expect } from 'vitest';

/** Shared domain matchers. Importing this module registers them on `expect`. */

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

expect.extend({
	toBeIsoDateString(received: unknown) {
		const pass = typeof received === 'string' && ISO_8601.test(received) && !Number.isNaN(Date.parse(received));
		return {
			pass,
			message: () => `expected ${JSON.stringify(received)} ${pass ? 'not ' : ''}to be an ISO-8601 date string`,
		};
	},
});

interface CustomMatchers<R = unknown> {
	toBeIsoDateString(): R;
}

declare module 'vitest' {
	interface Assertion<T = any> extends CustomMatchers<T> {}
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}

export {};
