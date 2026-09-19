import { ALL_PERMISSIONS, PERMISSIONS, isPermission, type Permission } from './permissions.js';

/**
 * Expands an API key's scope list into permissions. Grammar, per entry:
 *
 * - an exact permission: `documents:write`
 * - a resource wildcard: `documents:*`
 * - everything: `*`, or the legacy `admin`
 * - the legacy `read` (every read-tier permission) and `write` (read + write tiers)
 *
 * An EMPTY list grants nothing, and so does an entry that matches nothing: a
 * typo in a scope must never widen a key.
 */
export function expandScopes(scopes: readonly string[]): ReadonlySet<Permission> {
	const granted = new Set<Permission>();
	for (const scope of scopes) {
		for (const permission of expandScope(scope)) granted.add(permission);
	}
	return granted;
}

function expandScope(scope: string): readonly Permission[] {
	if (scope === '*' || scope === 'admin') return ALL_PERMISSIONS;
	if (scope === 'read') return ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].tier === 'read');
	if (scope === 'write') return ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].tier !== 'admin');
	if (scope.endsWith(':*')) {
		const prefix = scope.slice(0, -1); // keeps the colon: `documents:`
		return ALL_PERMISSIONS.filter((p) => p.startsWith(prefix));
	}
	return isPermission(scope) ? [scope] : [];
}

/** Scope entries that expand to nothing, so a key's misconfiguration can be reported instead of silently ignored. */
export function unknownScopes(scopes: readonly string[]): string[] {
	return scopes.filter((scope) => expandScope(scope).length === 0);
}
