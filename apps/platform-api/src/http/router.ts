import { Router, type RouterOptions } from 'express';

type AnyHandler = (...args: unknown[]) => unknown;

/**
 * Forwards a handler's failure to Express's error pipeline, whether it throws
 * synchronously or returns a rejected promise. Express 4 only catches the
 * former: an `async (req, res) => …` that rejects becomes an unhandled promise
 * rejection, which Node ≥ 15 turns into a process exit — so one request with a
 * malformed id used to take the whole API down (verified 2026-09-04). The arity
 * of the wrapped function is preserved because Express recognises error
 * middleware by its 4-argument signature.
 */
function forwardRejections(handler: AnyHandler): AnyHandler {
	if (handler.length === 4) {
		return function wrappedErrorHandler(err: unknown, req: unknown, res: unknown, next: unknown) {
			const nextFn = next as (e?: unknown) => void;
			try {
				const out = handler(err, req, res, next);
				if (out instanceof Promise) out.catch(nextFn);
			} catch (e) {
				nextFn(e);
			}
		} as AnyHandler;
	}
	return function wrappedHandler(req: unknown, res: unknown, next: unknown) {
		const nextFn = next as (e?: unknown) => void;
		try {
			const out = handler(req, res, next);
			if (out instanceof Promise) out.catch(nextFn);
		} catch (e) {
			nextFn(e);
		}
	} as AnyHandler;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'use'] as const;

/**
 * An Express Router whose route and middleware registrations are rejection-safe.
 * Every controller must create its router through this factory instead of
 * `Router()`; anything else is a latent process crash on the first rejected
 * promise. Non-function arguments (paths, arrays of handlers) pass through.
 */
export function createRouter(options?: RouterOptions): Router {
	const router = Router(options);
	for (const method of METHODS) {
		const original = (router[method] as AnyHandler).bind(router);
		(router as unknown as Record<string, AnyHandler>)[method] = (...args: unknown[]) =>
			original(...args.map(wrapArgument));
	}
	return router;
}

function wrapArgument(arg: unknown): unknown {
	if (typeof arg === 'function') return forwardRejections(arg as AnyHandler);
	if (Array.isArray(arg)) return arg.map(wrapArgument);
	return arg; // a path (string | RegExp) or an already-built Router
}
