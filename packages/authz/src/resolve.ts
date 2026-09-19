import { PERMISSIONS, type Permission } from './permissions.js';
import { ORG_ROLES, PROJECT_ROLES, isBuiltInProjectRoleKey, type OrgRoleKey } from './roles.js';

const NOTHING: ReadonlySet<Permission> = new Set();

/** Everything an org role grants, org- and project-scoped alike. */
export function orgRolePermissions(orgRole: OrgRoleKey): ReadonlySet<Permission> {
	return ORG_ROLES[orgRole].permissions;
}

/**
 * What a project role grants. An unknown key grants NOTHING rather than
 * throwing: a membership row can outlive the role it names (a removed custom
 * role, a rolled-back release), and failing closed is the only safe reading.
 * Returns `undefined` for "unknown" so the caller can log it.
 */
export function projectRolePermissions(roleKey: string): ReadonlySet<Permission> | undefined {
	return isBuiltInProjectRoleKey(roleKey) ? PROJECT_ROLES[roleKey].permissions : undefined;
}

export interface EffectiveProjectPermissionsInput {
	/** Project-scoped permissions the principal already holds org-wide (from an org role or a key's scopes). */
	held: ReadonlySet<Permission>;
	/** Their role in this project: the explicit membership, else the project's default member role, else none. */
	projectRoleKey: string | null | undefined;
}

/** A principal's permissions inside one project: what they hold org-wide plus what their project role adds. */
export function effectiveProjectPermissions(input: EffectiveProjectPermissionsInput): ReadonlySet<Permission> {
	const fromRole = input.projectRoleKey ? (projectRolePermissions(input.projectRoleKey) ?? NOTHING) : NOTHING;
	const effective = new Set<Permission>();
	for (const permission of input.held) if (PERMISSIONS[permission].scope === 'project') effective.add(permission);
	for (const permission of fromRole) effective.add(permission);
	return effective;
}

/** A project is visible to exactly the principals who can read it. */
export function canSeeProject(permissions: ReadonlySet<Permission>): boolean {
	return permissions.has('project:read');
}
