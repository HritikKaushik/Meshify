import type { RequestHandler } from 'express';
import type { Permission } from '@meshify/authz';

/**
 * Every route states who may call it. A route that says nothing is a route
 * nobody decided about, and that is how "any org member can do anything in
 * every project" happened: twelve handlers checked for an admin, and every
 * other mutation simply had no check to forget. `createRouter()` refuses to
 * register a route without one of these.
 */
export type RoutePolicy =
	| { kind: 'permission'; permission: Permission }
	/** Any authenticated principal. The reason says why no permission applies (e.g. the result is filtered per caller). */
	| { kind: 'authenticated'; reason: string }
	/** No credentials at all. The reason says what else protects it (a signature, a bearer token, nothing sensitive). */
	| { kind: 'public'; reason: string };

/**
 * A policy handler never reads route params, so it is typed to fit any route.
 * A plain `RequestHandler` (params: ParamsDictionary) placed before an inline
 * handler makes Express's overloads stop inferring `req.params` from the path
 * literal for every handler after it.
 */
export type PolicyHandler = RequestHandler<any>;

const ROUTE_POLICY = Symbol('meshify.routePolicy');

type Tagged = RequestHandler & { [ROUTE_POLICY]?: RoutePolicy };

export function tagRoutePolicy<H extends RequestHandler>(handler: H, policy: RoutePolicy): H {
	(handler as Tagged)[ROUTE_POLICY] = policy;
	return handler;
}

export function routePolicyOf(handler: unknown): RoutePolicy | undefined {
	return typeof handler === 'function' ? (handler as Tagged)[ROUTE_POLICY] : undefined;
}

const passThrough = (): PolicyHandler => (_req, _res, next) => next();

/** Declares a route that needs no credentials. Mount such routes before `authGuard`. */
export function publicRoute(reason: string): PolicyHandler {
	return tagRoutePolicy(passThrough(), { kind: 'public', reason });
}

/** Declares a route open to any authenticated principal, with no specific permission. */
export function authenticatedOnly(reason: string): PolicyHandler {
	return tagRoutePolicy(passThrough(), { kind: 'authenticated', reason });
}
