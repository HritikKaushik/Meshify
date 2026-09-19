import { ALL_PERMISSIONS, PROJECT_PERMISSIONS, type Permission } from './permissions.js';

/** Structural org roles. Mirrors the CHECK on `org_memberships.role_key`. */
export type OrgRoleKey = 'owner' | 'admin' | 'member';

/** The built-in project roles. `project_memberships.role_key` may hold others later (org-defined roles). */
export type BuiltInProjectRoleKey = 'pmo' | 'developer' | 'ba' | 'viewer';

export interface RoleDefinition<K extends string> {
	key: K;
	label: string;
	description: string;
	permissions: ReadonlySet<Permission>;
}

const without = (all: readonly Permission[], ...excluded: Permission[]): Permission[] => all.filter((p) => !excluded.includes(p));

/**
 * Owners and admins hold every project permission org-wide, which is why they
 * see every project with no special case anywhere: visibility is simply having
 * `project:read`. A plain member holds no project permission from their org
 * role; what they can do in a project comes from their role in that project.
 */
export const ORG_ROLES: Readonly<Record<OrgRoleKey, RoleDefinition<OrgRoleKey>>> = {
	owner: {
		key: 'owner',
		label: 'Owner',
		description: 'Full control of the organization, including its owners, billing and deletion.',
		permissions: new Set(ALL_PERMISSIONS),
	},
	admin: {
		key: 'admin',
		label: 'Admin',
		description: 'Manages members, integrations, AI providers and every project. Cannot change owners, billing, or delete the organization.',
		permissions: new Set(without(ALL_PERMISSIONS, 'org:delete', 'members:manage_owners', 'billing:manage')),
	},
	member: {
		key: 'member',
		label: 'Member',
		description: 'Can create projects and works in the projects they are a member of.',
		permissions: new Set<Permission>(['org:read', 'members:read', 'roles:read', 'projects:create', 'integrations:read', 'llm_providers:read']),
	},
};

/** What every project member can do, whatever their role: see the project and talk to it. */
const PROJECT_BASELINE: Permission[] = [
	'project:read',
	'project_members:read',
	'documents:read',
	'repositories:read',
	'connectors:read',
	'jobs:read',
	'chat:read',
	'chat:write',
	'memory:read',
	'workitems:read',
	'digests:read',
];

/** Contributing: add knowledge, propose memory, work on items. */
const CONTRIBUTE: Permission[] = ['documents:write', 'memory:propose', 'workitems:write'];

export const PROJECT_ROLES: Readonly<Record<BuiltInProjectRoleKey, RoleDefinition<BuiltInProjectRoleKey>>> = {
	pmo: {
		key: 'pmo',
		label: 'PMO',
		description: 'Runs the project: members, sources, settings, and the final say on what the project remembers.',
		permissions: new Set(PROJECT_PERMISSIONS),
	},
	developer: {
		key: 'developer',
		label: 'Developer',
		description: 'Connects and syncs repositories, adds documents, proposes memory and works on items.',
		permissions: new Set<Permission>([...PROJECT_BASELINE, ...CONTRIBUTE, 'repositories:write', 'repositories:sync', 'connectors:sync']),
	},
	ba: {
		key: 'ba',
		label: 'Business Analyst',
		description: 'Owns requirements and decisions: curates documents, edits and confirms memory, assigns work. No repository or connector management.',
		permissions: new Set<Permission>([
			...PROJECT_BASELINE,
			...CONTRIBUTE,
			'documents:delete',
			'memory:write',
			'memory:confirm',
			'memory:export',
			'workitems:assign',
			'digests:generate',
			'connectors:sync',
		]),
	},
	viewer: {
		key: 'viewer',
		label: 'Viewer',
		description: 'Reads everything in the project and can ask questions. Changes nothing.',
		permissions: new Set(PROJECT_BASELINE),
	},
};

export const ORG_ROLE_KEYS = Object.keys(ORG_ROLES) as OrgRoleKey[];
export const BUILT_IN_PROJECT_ROLE_KEYS = Object.keys(PROJECT_ROLES) as BuiltInProjectRoleKey[];

export function isOrgRoleKey(value: string): value is OrgRoleKey {
	return Object.prototype.hasOwnProperty.call(ORG_ROLES, value);
}

export function isBuiltInProjectRoleKey(value: string): value is BuiltInProjectRoleKey {
	return Object.prototype.hasOwnProperty.call(PROJECT_ROLES, value);
}
