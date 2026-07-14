/** Small, framework-agnostic async test helpers. */

/** Resolves after the current microtask + macrotask queue drains (flush pending promises). */
export const flushPromises = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));

/** An externally-resolvable promise — handy for controlling timing of mocked async work. */
export function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
