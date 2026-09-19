import type { AuthContext, OrgRoleKey } from '@meshify/data-access';
import { expandScopes, orgRolePermissions, type Permission } from '@meshify/authz';

/**
 * Who a request is, for authorization.
 *
 * - `user`: a signed-in person the BFF vouched for. Authority is their org role
 *   plus their role in each project.
 * - `legacy_user`: a BFF key with no verified identity - the previous BFF release
 *   during a deploy, or the permissive fallback after a rejected assertion. All
 *   that is known is the forwarded admin/member flag, so that is all it gets.
 *   Disappears once IDENTITY_ASSERTION_MODE=required.
 * - `service`: an API key acting on its own. Authority is its scopes, across
 *   every project in the org.
 */
export type Principal =
	| { kind: 'user'; userId: string; orgRole: OrgRoleKey }
	| { kind: 'legacy_user'; orgRole: 'admin' | 'member' }
	| { kind: 'service'; scopes: readonly string[] };

export function principalOf(auth: AuthContext): Principal {
	if (auth.userId && auth.orgRole) return { kind: 'user', userId: auth.userId, orgRole: auth.orgRole };
	if (auth.keyKind === 'bff') return { kind: 'legacy_user', orgRole: auth.isOrgAdmin ? 'admin' : 'member' };
	return { kind: 'service', scopes: auth.scopes };
}

/**
 * Everything the principal holds org-wide: org permissions, and any project
 * permissions that apply in EVERY project (an admin's, or a service key's).
 */
export function heldPermissions(principal: Principal): ReadonlySet<Permission> {
	if (principal.kind === 'service') return expandScopes(effectiveServiceScopes(principal.scopes));
	return orgRolePermissions(principal.orgRole);
}

/**
 * Until the cutover migration rewrites them, every service key that exists has
 * an EMPTY scope list, which has always meant "unrestricted". The catalog's own
 * reading of an empty list is "nothing", and that becomes the behaviour the
 * moment that migration turns `{}` into `{admin}`; this shim is deleted with it.
 */
function effectiveServiceScopes(scopes: readonly string[]): readonly string[] {
	return scopes.length === 0 ? ['*'] : scopes;
}
