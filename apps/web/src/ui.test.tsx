import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAsync } from './ui';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (err: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('useAsync', () => {
	afterEach(() => cleanup());

	it('drops a slow response from an earlier run so it cannot overwrite the latest one', async () => {
		const { result } = renderHook(() => useAsync<string>());
		const first = deferred<string>();
		const second = deferred<string>();

		let firstRun: Promise<string | undefined>;
		let secondRun: Promise<string | undefined>;
		act(() => {
			firstRun = result.current.run(() => first.promise); // project A
			secondRun = result.current.run(() => second.promise); // user switched to project B
		});
		await act(async () => {
			second.resolve('project B');
			await secondRun;
		});
		expect(result.current.data).toBe('project B');

		await act(async () => {
			first.resolve('project A'); // arrives late
			expect(await firstRun).toBeUndefined();
		});
		expect(result.current.data).toBe('project B');
		expect(result.current.state).toEqual({ status: 'success', value: 'project B' });
	});

	it('keeps the last successful data while a refresh is pending, then replaces it', async () => {
		const { result } = renderHook(() => useAsync<string[]>());
		await act(async () => {
			await result.current.run(async () => ['a']);
		});
		const refresh = deferred<string[]>();
		act(() => {
			void result.current.run(() => refresh.promise);
		});
		expect(result.current.state.status).toBe('pending');
		expect(result.current.data).toEqual(['a']); // not blanked

		await act(async () => {
			refresh.resolve(['a', 'b']);
			await refresh.promise;
		});
		expect(result.current.data).toEqual(['a', 'b']);
	});

	it('reports an error without discarding the previous data, and reset clears both', async () => {
		const { result } = renderHook(() => useAsync<number>());
		await act(async () => {
			await result.current.run(async () => 1);
		});
		await act(async () => {
			await result.current.run(async () => Promise.reject(new Error('nope')));
		});
		expect(result.current.state).toMatchObject({ status: 'error', error: expect.objectContaining({ message: 'nope' }) });
		expect(result.current.data).toBe(1);
		act(() => result.current.reset());
		expect(result.current.state).toEqual({ status: 'idle' });
		expect(result.current.data).toBeUndefined();
	});

	it('ignores a result that lands after unmount', async () => {
		const { result, unmount } = renderHook(() => useAsync<string>());
		const pending = deferred<string>();
		let run: Promise<string | undefined>;
		act(() => {
			run = result.current.run(() => pending.promise);
		});
		unmount();
		pending.resolve('late');
		expect(await run!).toBeUndefined();
	});
});
