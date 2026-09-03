import { RocketRidePipelineTimeoutError } from './pipeline-registry.js';

/**
 * Bounds a RocketRide call so an unresponsive engine surfaces a clear error
 * instead of hanging forever. Used for lifecycle ops (use/restart) and, since
 * the data path was found to be unbounded, for chat and file ingestion too: a
 * wedged engine left worker jobs `active` indefinitely with a healthy lock, so
 * they never stalled, never retried, and permanently occupied their queue slot.
 */
export async function withTimeout<T>(op: Promise<T>, label: string, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new RocketRidePipelineTimeoutError(label, ms)), ms);
	});
	try {
		return await Promise.race([op, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
