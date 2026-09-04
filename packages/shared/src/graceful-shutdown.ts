import type { Server } from 'node:http';

export interface ShutdownLogger {
	info(obj: Record<string, unknown>, msg: string): void;
	warn(obj: Record<string, unknown>, msg: string): void;
	error(obj: Record<string, unknown>, msg: string): void;
}

export interface ShutdownStep {
	name: string;
	run: () => Promise<unknown> | unknown;
}

export interface GracefulShutdownOptions {
	logger: ShutdownLogger;
	/** Run in order; a failing step is logged and the next one still runs. */
	steps: ShutdownStep[];
	/** Hard deadline for the whole sequence; past it the process exits 1 rather than hang the rollout. */
	timeoutMs?: number;
	/** Injectable for tests. */
	exit?: (code: number) => void;
	signals?: NodeJS.Signals[];
}

export interface GracefulShutdown {
	/** Idempotent: the first call starts the sequence, later calls return the same promise. */
	shutdown(reason: string): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Orderly process shutdown for SIGTERM/SIGINT. Steps run one after another
 * (stop taking work, drain what is in flight, then close clients), each
 * awaited and logged, and a second signal while draining is ignored instead
 * of restarting the sequence or being lost. A hard deadline bounds the whole
 * thing: when a step hangs (a wedged engine connection, a queue that never
 * drains) the process exits 1 so the orchestrator can move on, rather than
 * sitting until it is killed and taking the in-flight work with it.
 */
export function installGracefulShutdown(options: GracefulShutdownOptions): GracefulShutdown {
	const { logger, steps } = options;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const exit = options.exit ?? ((code: number) => process.exit(code));
	let inProgress: Promise<void> | undefined;

	const run = async (reason: string): Promise<void> => {
		logger.info({ reason, steps: steps.map((s) => s.name), timeoutMs }, 'shutting down');
		const deadline = setTimeout(() => {
			logger.error({ reason, timeoutMs }, 'shutdown deadline exceeded; exiting without finishing');
			exit(1);
		}, timeoutMs);
		deadline.unref();

		let failed = 0;
		for (const step of steps) {
			const startedAt = Date.now();
			try {
				await step.run();
				logger.info({ step: step.name, ms: Date.now() - startedAt }, 'shutdown step done');
			} catch (err) {
				failed += 1;
				logger.warn({ step: step.name, err: err instanceof Error ? err.message : String(err) }, 'shutdown step failed; continuing');
			}
		}
		clearTimeout(deadline);
		logger.info({ reason, failed }, 'shutdown complete');
		exit(failed > 0 ? 1 : 0);
	};

	const shutdown = (reason: string): Promise<void> => {
		if (inProgress) {
			logger.warn({ reason }, 'shutdown already in progress; ignoring');
			return inProgress;
		}
		inProgress = run(reason);
		return inProgress;
	};

	for (const signal of options.signals ?? ['SIGTERM', 'SIGINT']) {
		process.on(signal, () => void shutdown(signal));
	}
	return { shutdown };
}

/** The subset of http.Server the drain needs (fakeable in tests). */
export interface ClosableServer {
	close(callback?: (err?: Error) => void): unknown;
	closeIdleConnections?(): void;
	closeAllConnections?(): void;
}

/**
 * Stop accepting connections and wait for in-flight requests to finish, up
 * to `drainMs`; then force the rest closed. Long-lived responses (SSE
 * streams, a slow upload) would otherwise keep `server.close()` from ever
 * calling back, and a rollout would wait for the orchestrator's kill.
 */
export function closeHttpServer(server: ClosableServer | Server, options: { drainMs?: number } = {}): Promise<void> {
	const drainMs = options.drainMs ?? 10_000;
	return new Promise<void>((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			server.closeAllConnections?.();
			finish();
		}, drainMs);
		timer.unref();
		server.close(() => finish());
		// Keep-alive connections with no request in flight hold close() open too.
		server.closeIdleConnections?.();
	});
}
