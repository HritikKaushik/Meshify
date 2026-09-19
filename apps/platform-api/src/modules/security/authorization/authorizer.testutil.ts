import type { ProjectMembershipRepository } from '@meshify/data-access';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { createAuthorizer, type AuthorizationDenial, type Authorizer, type RbacEnforcementMode } from './authorizer.js';
import { ProjectAccessResolver } from './project-access.js';

export interface TestAuthorizer {
	authz: Authorizer;
	/** Every denial the authorizer reported, in order. */
	denials: AuthorizationDenial[];
	unknownRoles: string[];
}

/**
 * The REAL authorizer over in-memory collaborators, for controller and e2e
 * tests. Defaults to `enforce`, so a test that reaches a handler has proven the
 * route's declared permission actually admits its principal.
 */
export function buildTestAuthorizer(opts: {
	getProject: GetProjectUseCase;
	memberships?: Pick<ProjectMembershipRepository, 'findByProjectAndUser'>;
	mode?: RbacEnforcementMode;
}): TestAuthorizer {
	const denials: AuthorizationDenial[] = [];
	const unknownRoles: string[] = [];
	const authz = createAuthorizer({
		getProject: opts.getProject,
		access: new ProjectAccessResolver({
			memberships: opts.memberships ?? { findByProjectAndUser: async () => undefined },
			onUnknownRole: (roleKey) => void unknownRoles.push(roleKey),
		}),
		mode: opts.mode ?? 'enforce',
		onDenied: (denial) => void denials.push(denial),
	});
	return { authz, denials, unknownRoles };
}
