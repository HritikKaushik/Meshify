import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeHttpServer, installGracefulShutdown } from './graceful-shutdown.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('installGracefulShutdown', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		process.removeAllListeners('SIGUSR2');
	});

	it('runs the steps in order, keeps going past a failing one, and exits with its outcome', async () => {
		const order: string[] = [];
		const exit = vi.fn();
		const { shutdown } = installGracefulShutdown({
			logger,
			exit,
			signals: ['SIGUSR2'],
			steps: [
				{ name: 'stop intake', run: () => void order.push('stop intake') },
				{ name: 'drain', run: async () => Promise.reject(new Error('queue wedged')) },
				{ name: 'close db', run: async () => void order.push('close db') },
			],
		});
		await shutdown('SIGTERM');
		expect(order).toEqual(['stop intake', 'close db']);
		expect(exit).toHaveBeenCalledWith(1);
		expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ step: 'drain' }), expect.stringContaining('failed'));
	});

	it('exits 0 when every step succeeds and ignores a second signal while draining', async () => {
		const exit = vi.fn();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		let runs = 0;
		const { shutdown } = installGracefulShutdown({
			logger,
			exit,
			signals: ['SIGUSR2'],
			steps: [{ name: 'drain', run: () => (runs += 1, gate) }],
		});
		const first = shutdown('SIGTERM');
		const second = shutdown('SIGTERM');
		expect(second).toBe(first);
		release();
		await first;
		expect(runs).toBe(1);
		expect(exit).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it('exits 1 at the deadline when a step hangs', async () => {
		const exit = vi.fn();
		const { shutdown } = installGracefulShutdown({
			logger,
			exit,
			signals: ['SIGUSR2'],
			timeoutMs: 5_000,
			steps: [{ name: 'hang', run: () => new Promise<never>(() => {}) }],
		});
		void shutdown('SIGTERM');
		await vi.advanceTimersByTimeAsync(5_000);
		expect(exit).toHaveBeenCalledWith(1);
	});
});

describe('closeHttpServer', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('resolves when the server closes on its own within the drain window', async () => {
		const server = { close: vi.fn((cb?: () => void) => cb?.()), closeIdleConnections: vi.fn(), closeAllConnections: vi.fn() };
		await closeHttpServer(server, { drainMs: 1_000 });
		expect(server.closeIdleConnections).toHaveBeenCalledOnce();
		expect(server.closeAllConnections).not.toHaveBeenCalled();
	});

	it('forces the remaining connections closed once the drain window passes', async () => {
		const server = { close: vi.fn(), closeIdleConnections: vi.fn(), closeAllConnections: vi.fn() }; // never calls back: an SSE stream is open
		const done = closeHttpServer(server, { drainMs: 1_000 });
		await vi.advanceTimersByTimeAsync(1_000);
		await done;
		expect(server.closeAllConnections).toHaveBeenCalledOnce();
	});
});
