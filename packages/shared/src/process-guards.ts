export interface ProcessGuardLogger {
	error: (obj: unknown, msg: string) => void;
	fatal: (obj: unknown, msg: string) => void;
}

export interface ProcessGuardOptions {
	/** Override for tests; defaults to `process.exit`. */
	exit?: (code: number) => void;
	/** Override for tests; defaults to the real `process`. */
	target?: NodeJS.EventEmitter;
}

/**
 * Last-line-of-defence handlers for the two process-level failure signals.
 *
 * - `unhandledRejection`: logged and survived. Node ≥ 15 would otherwise crash
 *   the process for a promise nobody awaited — a stray rejection from a
 *   background task must not take an API or a queue consumer down. The log line
 *   is at error level so it is never silent.
 * - `uncaughtException`: logged at fatal level, then the process exits with 1.
 *   After a synchronous throw escapes every frame the heap is in an unknown
 *   state; the orchestrator restarts the container from a clean one.
 *
 * Install once, as early as possible in each app's entrypoint.
 */
export function installProcessGuards(logger: ProcessGuardLogger, options: ProcessGuardOptions = {}): void {
	const target = options.target ?? process;
	const exit = options.exit ?? ((code: number) => process.exit(code));
	target.on('unhandledRejection', (reason: unknown) => {
		logger.error({ err: reason }, 'unhandled promise rejection (process kept alive)');
	});
	target.on('uncaughtException', (err: unknown) => {
		logger.fatal({ err }, 'uncaught exception — exiting');
		exit(1);
	});
}
