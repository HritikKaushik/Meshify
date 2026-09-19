import { describe, expect, it } from 'vitest';
import {
	ALL_PERMISSIONS,
	BUILT_IN_PROJECT_ROLE_KEYS,
	ORG_ROLES,
	ORG_ROLE_KEYS,
	PERMISSIONS,
	PROJECT_PERMISSIONS,
	PROJECT_ROLES,
	canSeeProject,
	effectiveProjectPermissions,
	expandScopes,
	orgRolePermissions,
	projectRolePermissions,
	unknownScopes,
	type Permission,
} from './index.js';

const sorted = (permissions: Iterable<Permission>): Permission[] => [...permissions].sort();

describe('permission catalog', () => {
	it('names every permission as <resource>:<action>', () => {
		for (const permission of ALL_PERMISSIONS) expect(permission).toMatch(/^[a-z_]+:[a-z_]+$/);
	});

	it('gives every role only permissions that exist', () => {
		for (const role of [...Object.values(ORG_ROLES), ...Object.values(PROJECT_ROLES)]) {
			for (const permission of role.permissions) expect(PERMISSIONS[permission]).toBeDefined();
		}
	});

	it('grants project roles project-scoped permissions only', () => {
		for (const role of Object.values(PROJECT_ROLES)) {
			for (const permission of role.permissions) expect(PERMISSIONS[permission].scope).toBe('project');
		}
	});
});

describe('org roles', () => {
	it('owner holds everything', () => {
		expect(sorted(orgRolePermissions('owner'))).toEqual(sorted(ALL_PERMISSIONS));
	});

	it('admin holds everything except ownership, billing and deleting the org', () => {
		const missing = ALL_PERMISSIONS.filter((p) => !orgRolePermissions('admin').has(p));
		expect(sorted(missing)).toEqual(['billing:manage', 'members:manage_owners', 'org:delete']);
	});

	it('owner and admin see and control every project; a member holds no project permission from their org role', () => {
		for (const permission of PROJECT_PERMISSIONS) {
			expect(orgRolePermissions('owner').has(permission)).toBe(true);
			expect(orgRolePermissions('admin').has(permission)).toBe(true);
			expect(orgRolePermissions('member').has(permission)).toBe(false);
		}
	});

	it('member: the exact grant', () => {
		expect(sorted(orgRolePermissions('member'))).toMatchInlineSnapshot(`
			[
			  "integrations:read",
			  "llm_providers:read",
			  "members:read",
			  "org:read",
			  "projects:create",
			  "roles:read",
			]
		`);
	});
});

describe('project roles', () => {
	it('every role can see the project and chat with it', () => {
		for (const key of BUILT_IN_PROJECT_ROLE_KEYS) {
			expect(PROJECT_ROLES[key].permissions.has('project:read')).toBe(true);
			expect(PROJECT_ROLES[key].permissions.has('chat:write')).toBe(true);
		}
	});

	it('pmo holds every project permission', () => {
		expect(sorted(PROJECT_ROLES.pmo.permissions)).toEqual(sorted(PROJECT_PERMISSIONS));
	});

	it('viewer changes nothing: no write- or admin-tier permission except asking questions', () => {
		const mutating = sorted(PROJECT_ROLES.viewer.permissions).filter((p) => PERMISSIONS[p].tier !== 'read');
		expect(mutating).toEqual(['chat:write']);
	});

	it('only the pmo manages members, settings, connectors and deletion', () => {
		const pmoOnly: Permission[] = ['project:update', 'project:delete', 'project_members:manage', 'connectors:manage', 'repositories:delete', 'chat:manage', 'memory:delete', 'memory:admin', 'workitems:delete', 'digests:configure'];
		for (const permission of pmoOnly) {
			expect(PROJECT_ROLES.pmo.permissions.has(permission)).toBe(true);
			for (const key of ['developer', 'ba', 'viewer'] as const) expect(PROJECT_ROLES[key].permissions.has(permission)).toBe(false);
		}
	});

	it('a developer works with repositories but cannot confirm memory; a BA is the reverse', () => {
		expect(PROJECT_ROLES.developer.permissions.has('repositories:write')).toBe(true);
		expect(PROJECT_ROLES.developer.permissions.has('memory:confirm')).toBe(false);
		expect(PROJECT_ROLES.ba.permissions.has('repositories:write')).toBe(false);
		expect(PROJECT_ROLES.ba.permissions.has('memory:confirm')).toBe(true);
	});

	// The matrix is the product's access policy. Any change to it shows up here as a diff to review.
	it('developer: the exact grant', () => {
		expect(sorted(PROJECT_ROLES.developer.permissions)).toMatchInlineSnapshot(`
			[
			  "chat:read",
			  "chat:write",
			  "connectors:read",
			  "connectors:sync",
			  "digests:read",
			  "documents:read",
			  "documents:write",
			  "jobs:read",
			  "memory:propose",
			  "memory:read",
			  "project:read",
			  "project_members:read",
			  "repositories:read",
			  "repositories:sync",
			  "repositories:write",
			  "workitems:read",
			  "workitems:write",
			]
		`);
	});

	it('ba: the exact grant', () => {
		expect(sorted(PROJECT_ROLES.ba.permissions)).toMatchInlineSnapshot(`
			[
			  "chat:read",
			  "chat:write",
			  "connectors:read",
			  "connectors:sync",
			  "digests:generate",
			  "digests:read",
			  "documents:delete",
			  "documents:read",
			  "documents:write",
			  "jobs:read",
			  "memory:confirm",
			  "memory:export",
			  "memory:propose",
			  "memory:read",
			  "memory:write",
			  "project:read",
			  "project_members:read",
			  "repositories:read",
			  "workitems:assign",
			  "workitems:read",
			  "workitems:write",
			]
		`);
	});

	it('viewer: the exact grant', () => {
		expect(sorted(PROJECT_ROLES.viewer.permissions)).toMatchInlineSnapshot(`
			[
			  "chat:read",
			  "chat:write",
			  "connectors:read",
			  "digests:read",
			  "documents:read",
			  "jobs:read",
			  "memory:read",
			  "project:read",
			  "project_members:read",
			  "repositories:read",
			  "workitems:read",
			]
		`);
	});

	it('an unknown role key resolves to nothing, and says so', () => {
		expect(projectRolePermissions('release_manager')).toBeUndefined();
		expect(effectiveProjectPermissions({ held: new Set(), projectRoleKey: 'release_manager' }).size).toBe(0);
	});
});

describe('effectiveProjectPermissions', () => {
	it('a plain member with no role in the project holds nothing and cannot see it', () => {
		const effective = effectiveProjectPermissions({ held: orgRolePermissions('member'), projectRoleKey: null });
		expect(effective.size).toBe(0);
		expect(canSeeProject(effective)).toBe(false);
	});

	it('a plain member gets exactly their project role', () => {
		const effective = effectiveProjectPermissions({ held: orgRolePermissions('member'), projectRoleKey: 'viewer' });
		expect(sorted(effective)).toEqual(sorted(PROJECT_ROLES.viewer.permissions));
	});

	it('an admin sees and controls a project they have no role in, and never carries org permissions into it', () => {
		const effective = effectiveProjectPermissions({ held: orgRolePermissions('admin'), projectRoleKey: null });
		expect(sorted(effective)).toEqual(sorted(PROJECT_PERMISSIONS));
	});

	it('a project role only ever adds: an admin who is also a viewer keeps full control', () => {
		const effective = effectiveProjectPermissions({ held: orgRolePermissions('admin'), projectRoleKey: 'viewer' });
		expect(effective.has('project:delete')).toBe(true);
	});

	it('every org role key is resolvable', () => {
		for (const key of ORG_ROLE_KEYS) expect(orgRolePermissions(key).size).toBeGreaterThan(0);
	});
});

describe('expandScopes', () => {
	it('an empty scope list grants nothing', () => {
		expect(expandScopes([]).size).toBe(0);
	});

	it('grants an exact permission and nothing else', () => {
		expect(sorted(expandScopes(['documents:write']))).toEqual(['documents:write']);
	});

	it('expands a resource wildcard to that resource only (documents:* does not reach document-ish prefixes)', () => {
		expect(sorted(expandScopes(['documents:*']))).toEqual(['documents:delete', 'documents:read', 'documents:write']);
		expect(sorted(expandScopes(['project:*']))).toEqual(['project:delete', 'project:read', 'project:update']);
	});

	it('* and the legacy admin scope grant everything', () => {
		expect(expandScopes(['*']).size).toBe(ALL_PERMISSIONS.length);
		expect(expandScopes(['admin']).size).toBe(ALL_PERMISSIONS.length);
	});

	it('the legacy read scope grants read-tier permissions only; write adds the write tier and never the admin tier', () => {
		for (const permission of expandScopes(['read'])) expect(PERMISSIONS[permission].tier).toBe('read');
		const write = expandScopes(['write']);
		expect(write.has('documents:write')).toBe(true);
		expect(write.has('documents:read')).toBe(true);
		for (const permission of write) expect(PERMISSIONS[permission].tier).not.toBe('admin');
	});

	it('a typo widens nothing, and is reportable', () => {
		expect(expandScopes(['documents:wirte', 'docs:*', 'Admin']).size).toBe(0);
		expect(unknownScopes(['documents:write', 'documents:wirte', 'docs:*'])).toEqual(['documents:wirte', 'docs:*']);
	});

	it('unions multiple scopes', () => {
		expect(sorted(expandScopes(['chat:read', 'jobs:read', 'chat:read']))).toEqual(['chat:read', 'jobs:read']);
	});
});
