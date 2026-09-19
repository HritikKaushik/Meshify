import type { AuthContext, Project, ProjectMembershipRepository } from '@meshify/data-access';
import { canSeeProject, effectiveProjectPermissions, projectRolePermissions, type Permission } from '@meshify/authz';
import { heldPermissions, principalOf } from './principal.js';

/** Where a principal's access to one project comes from. Shown in the UI, and recorded when access is denied. */
export type ProjectAccessSource = 'explicit' | 'project_default' | 'org_role' | 'service_key' | 'none';

export interface ProjectAccess {
	projectId: string;
	/** Their role in this project: the explicit membership, else the project's default member role, else none. */
	role: string | null;
	source: ProjectAccessSource;
	permissions: ReadonlySet<Permission>;
	/** Whether the project exists at all, as far as this principal is concerned. */
	visible: boolean;
}

export interface ProjectAccessResolverDeps {
	memberships: Pick<ProjectMembershipRepository, 'findByProjectAndUser'>;
	/** A membership naming a role the catalog does not know grants nothing; this says so. */
	onUnknownRole?: (roleKey: string, projectId: string) => void;
}

/**
 * Resolves what a principal may do in one project. Deliberately uncached across
 * requests: it is one indexed lookup, and an answer that is always current
 * means a role change or a removal needs no invalidation to take effect.
 */
export class ProjectAccessResolver {
	constructor(private readonly deps: ProjectAccessResolverDeps) {}

	async resolve(auth: AuthContext, project: Project): Promise<ProjectAccess> {
		const principal = principalOf(auth);
		const held = heldPermissions(principal);

		let role: string | null = null;
		let source: ProjectAccessSource = principal.kind === 'service' ? 'service_key' : 'org_role';

		if (principal.kind === 'user') {
			const membership = await this.deps.memberships.findByProjectAndUser(project.id, principal.userId);
			if (membership) {
				role = membership.roleKey;
				source = 'explicit';
			}
		}
		// The default member role is a grant to the org's PEOPLE. A service key's
		// reach is its scopes and nothing else.
		if (!role && principal.kind !== 'service' && project.defaultMemberRoleKey) {
			role = project.defaultMemberRoleKey;
			source = 'project_default';
		}
		if (role && !projectRolePermissions(role)) this.deps.onUnknownRole?.(role, project.id);

		const permissions = effectiveProjectPermissions({ held, projectRoleKey: role });
		const visible = canSeeProject(permissions);
		return { projectId: project.id, role, source: visible ? source : 'none', permissions, visible };
	}
}
