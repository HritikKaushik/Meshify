import { Router, type RouterOptions } from 'express';
import { routePolicyOf, type RoutePolicy } from './route-policy.js';

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

/** Registrations that define an endpoint. `use` mounts middleware or a sub-router, so it carries no policy of its own. */
const ENDPOINT_METHODS: ReadonlySet<string> = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);

export interface RouteManifestEntry {
	method: string;
	path: string;
	policy: RoutePolicy;
}

const ROUTE_MANIFEST = Symbol('meshify.routeManifest');

/** Thrown at registration, so an endpoint nobody decided about fails the boot instead of shipping open. */
export class UndeclaredRoutePolicyError extends Error {
	constructor(method: string, path: string) {
		super(
			`Route ${method.toUpperCase()} ${path} declares no access policy. Add authorize('<permission>'), authenticatedOnly('<why>') or publicRoute('<why>') to its handlers.`
		);
		this.name = 'UndeclaredRoutePolicyError';
	}
}

/**
 * An Express Router whose route and middleware registrations are rejection-safe,
 * and whose every endpoint declares who may call it.
 *
 * Every controller must create its router through this factory instead of
 * `Router()`; anything else is a latent process crash on the first rejected
 * promise. Non-function arguments (paths, arrays of handlers) pass through.
 *
 * An endpoint registered without a policy-tagged handler (see route-policy.ts)
 * throws here, at registration: the mistake that left most mutations unguarded
 * was an absent check, and an absent check cannot be seen in review.
 */
export function createRouter(options?: RouterOptions): Router {
	const router = Router(options);
	const manifest: RouteManifestEntry[] = [];
	(router as unknown as Record<symbol, unknown>)[ROUTE_MANIFEST] = manifest;

	for (const method of METHODS) {
		const original = (router[method] as AnyHandler).bind(router);
		(router as unknown as Record<string, AnyHandler>)[method] = (...args: unknown[]) => {
			// Read the policy BEFORE wrapping: forwardRejections returns a new function
			// that does not carry the tag.
			if (ENDPOINT_METHODS.has(method)) manifest.push(declaredPolicy(method, args));
			return original(...args.map(wrapArgument));
		};
	}
	return router;
}

/** The endpoints a router built by `createRouter` registered, with the policy each one declared. */
export function routeManifest(router: Router): readonly RouteManifestEntry[] {
	return ((router as unknown as Record<symbol, unknown>)[ROUTE_MANIFEST] as RouteManifestEntry[] | undefined) ?? [];
}

function declaredPolicy(method: string, args: unknown[]): RouteManifestEntry {
	const [first, ...rest] = args;
	const hasPath = isPath(first);
	const path = hasPath ? (Array.isArray(first) ? first.map(String).join(' | ') : String(first)) : '(no path)';
	const handlers = (hasPath ? rest : args).flat(Infinity);
	const policies = handlers.map(routePolicyOf).filter((policy): policy is RoutePolicy => policy !== undefined);
	const policy = policies[0];
	if (!policy) throw new UndeclaredRoutePolicyError(method, path);
	if (policies.length > 1) throw new Error(`Route ${method.toUpperCase()} ${path} declares ${policies.length} access policies; exactly one is allowed.`);
	return { method: method.toUpperCase(), path, policy };
}

/** Express accepts a string, a RegExp, or an array of either as a route path. */
function isPath(arg: unknown): arg is string | RegExp | Array<string | RegExp> {
	if (typeof arg === 'string' || arg instanceof RegExp) return true;
	return Array.isArray(arg) && arg.length > 0 && arg.every((entry) => typeof entry === 'string' || entry instanceof RegExp);
}

function wrapArgument(arg: unknown): unknown {
	if (typeof arg === 'function') return forwardRejections(arg as AnyHandler);
	if (Array.isArray(arg)) return arg.map(wrapArgument);
	return arg; // a path (string | RegExp) or an already-built Router
}
