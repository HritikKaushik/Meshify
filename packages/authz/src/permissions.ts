/**
 * Every permission in the system. `scope` says where it is held: `org`
 * permissions come from a person's org role (or a service key's scopes);
 * `project` permissions come from their role in one project.
 *
 * `tier` exists only to give the legacy `read` / `write` API-key scopes a
 * meaning: `read` grants every read-tier permission, `write` grants read and
 * write, and nothing but `admin` (or an explicit scope) reaches the admin tier.
 */
export type PermissionScope = 'org' | 'project';
export type PermissionTier = 'read' | 'write' | 'admin';

export interface PermissionSpec {
	scope: PermissionScope;
	tier: PermissionTier;
}

const org = (tier: PermissionTier): PermissionSpec => ({ scope: 'org', tier });
const project = (tier: PermissionTier): PermissionSpec => ({ scope: 'project', tier });

export const PERMISSIONS = {
	// --- organization
	'org:read': org('read'),
	'org:update': org('admin'),
	'org:delete': org('admin'),
	'members:read': org('read'),
	'members:invite': org('admin'),
	'members:remove': org('admin'),
	'members:manage_roles': org('admin'),
	'members:manage_owners': org('admin'),
	'roles:read': org('read'),
	'roles:manage': org('admin'),
	'projects:create': org('write'),
	'integrations:read': org('read'),
	'integrations:manage': org('admin'),
	'provider_registrations:read': org('admin'),
	'provider_registrations:manage': org('admin'),
	'llm_providers:read': org('read'),
	'llm_providers:manage': org('admin'),
	'apikeys:read': org('admin'),
	'apikeys:manage': org('admin'),
	'audit:read': org('admin'),
	'billing:manage': org('admin'),

	// --- project
	'project:read': project('read'),
	'project:update': project('admin'),
	'project:delete': project('admin'),
	'project_members:read': project('read'),
	'project_members:manage': project('admin'),
	'documents:read': project('read'),
	'documents:write': project('write'),
	'documents:delete': project('write'),
	'repositories:read': project('read'),
	'repositories:write': project('write'),
	'repositories:sync': project('write'),
	'repositories:delete': project('admin'),
	'connectors:read': project('read'),
	'connectors:sync': project('write'),
	'connectors:manage': project('admin'),
	'jobs:read': project('read'),
	'chat:read': project('read'),
	'chat:write': project('write'),
	'chat:manage': project('admin'),
	'memory:read': project('read'),
	'memory:propose': project('write'),
	'memory:write': project('write'),
	'memory:confirm': project('write'),
	'memory:export': project('write'),
	'memory:delete': project('admin'),
	'memory:admin': project('admin'),
	'workitems:read': project('read'),
	'workitems:write': project('write'),
	'workitems:assign': project('write'),
	'workitems:delete': project('admin'),
	'digests:read': project('read'),
	'digests:generate': project('write'),
	'digests:configure': project('admin'),
} as const satisfies Record<string, PermissionSpec>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
	return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

export function permissionScope(permission: Permission): PermissionScope {
	return PERMISSIONS[permission].scope;
}

export const ORG_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].scope === 'org');
export const PROJECT_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].scope === 'project');
