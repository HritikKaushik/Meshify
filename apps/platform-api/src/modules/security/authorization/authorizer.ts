import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthContext, Project } from '@meshify/data-access';
import { permissionScope, type Permission } from '@meshify/authz';
import { tagRoutePolicy, type PolicyHandler } from '../../../http/route-policy.js';
import { projectIsolationGuard, respondProjectNotFound } from '../../projects/interface/project-isolation.guard.js';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { heldPermissions, principalOf, type Principal } from './principal.js';
import type { ProjectAccess, ProjectAccessResolver } from './project-access.js';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			/** What the caller may do in `req.project`. Set by `authorize()` on project-scoped routes. */
			projectAccess?: ProjectAccess;
		}
	}
}

/**
 * `shadow`: every decision is computed and a denial is only COUNTED; the
 * request continues to the checks that existed before. It is how the matrix is
 * proven against real traffic before it can lock anyone out.
 * `enforce`: a denial is answered with 404 (the project is not visible to the
 * caller) or 403 (it is, but they may not do this).
 */
export type RbacEnforcementMode = 'shadow' | 'enforce';

export interface AuthorizationDenial {
	permission: Permission;
	/** The matched route pattern, never the concrete URL, so metric cardinality stays bounded. */
	route: string;
	principalKind: Principal['kind'];
	/** `hidden`: the caller cannot see the project at all. `forbidden`: they can, but lack this permission. */
	outcome: 'hidden' | 'forbidden';
	orgId: string;
	projectId?: string;
	userId?: string;
	keyId: string;
}

export interface AuthorizerDeps {
	getProject: GetProjectUseCase;
	access: ProjectAccessResolver;
	mode: RbacEnforcementMode;
	/** Called for every denial, in both modes. */
	onDenied: (denial: AuthorizationDenial, mode: RbacEnforcementMode) => void;
}

/** What an imperative project check concluded. In shadow mode it is always `allowed`. */
export type ProjectCheckOutcome = 'allowed' | 'hidden' | 'forbidden';

export interface Authorizer {
	/**
	 * Route middleware requiring `permission`. For a project-scoped permission it
	 * also does what `projectIsolationGuard` did (loads `:projectId`, 404s across
	 * orgs, sets `req.project`) and sets `req.projectAccess`. It must be the first
	 * handler on the route - in particular before any body parser or multer, so
	 * an unauthorized upload is refused before it is buffered.
	 */
	authorize(permission: Permission): PolicyHandler;
	/**
	 * For a project named in a request BODY or reached through another resource
	 * (a job id), where no `:projectId` route parameter exists to guard. The
	 * project must already be known to belong to the caller's org.
	 */
	checkProject(req: Request, project: Project, permission: Permission): Promise<ProjectCheckOutcome>;
	/** `checkProject` for a bare id. A project that is missing, or another org's, is `hidden`. */
	checkProjectById(req: Request, projectId: string, permission: Permission): Promise<ProjectCheckOutcome>;
}

export function forbiddenBody(permission: Permission): { error: string; code: 'forbidden'; permission: Permission } {
	return { error: 'You do not have permission to do this', code: 'forbidden', permission };
}

export function createAuthorizer(deps: AuthorizerDeps): Authorizer {
	const isolation = projectIsolationGuard(deps.getProject);

	const routeOf = (req: Request): string => (typeof req.route?.path === 'string' ? req.route.path : 'unmatched');

	const report = (req: Request, auth: AuthContext, permission: Permission, outcome: 'hidden' | 'forbidden', projectId?: string): void => {
		deps.onDenied(
			{
				permission,
				route: routeOf(req),
				principalKind: principalOf(auth).kind,
				outcome,
				orgId: auth.orgId,
				keyId: auth.keyId,
				...(projectId ? { projectId } : {}),
				...(auth.userId ? { userId: auth.userId } : {}),
			},
			deps.mode
		);
	};

	const orgHandler =
		(permission: Permission): RequestHandler =>
		(req, res, next) => {
			const auth = req.auth;
			if (!auth) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}
			if (heldPermissions(principalOf(auth)).has(permission)) {
				next();
				return;
			}
			report(req, auth, permission, 'forbidden');
			if (deps.mode === 'shadow') {
				next();
				return;
			}
			res.status(403).json(forbiddenBody(permission));
		};

	const projectHandler =
		(permission: Permission): RequestHandler =>
		(req: Request, res: Response, next: NextFunction) => {
			// Tenant isolation first and unchanged: it owns the 400/401/404 for a
			// missing, malformed, unknown or other-org project id.
			void isolation(req, res, (err?: unknown) => {
				if (err) {
					next(err);
					return;
				}
				const auth = req.auth!;
				const project = req.project!;
				deps.access
					.resolve(auth, project)
					.then((access) => {
						req.projectAccess = access;
						if (access.permissions.has(permission)) {
							next();
							return;
						}
						const outcome = access.visible ? 'forbidden' : 'hidden';
						report(req, auth, permission, outcome, project.id);
						if (deps.mode === 'shadow') {
							next();
							return;
						}
						// A project the caller cannot see must be indistinguishable from
						// one that does not exist, byte for byte.
						if (outcome === 'hidden') respondProjectNotFound(res, project.id);
						else res.status(403).json(forbiddenBody(permission));
					})
					.catch(next);
			});
		};

	return {
		authorize(permission) {
			const handler = permissionScope(permission) === 'org' ? orgHandler(permission) : projectHandler(permission);
			return tagRoutePolicy(handler, { kind: 'permission', permission });
		},

		async checkProject(req, project, permission) {
			const auth = req.auth!;
			const access = await deps.access.resolve(auth, project);
			if (access.permissions.has(permission)) return 'allowed';
			const outcome = access.visible ? 'forbidden' : 'hidden';
			report(req, auth, permission, outcome, project.id);
			return deps.mode === 'shadow' ? 'allowed' : outcome;
		},

		async checkProjectById(req, projectId, permission) {
			const auth = req.auth!;
			const project = await deps.getProject.execute(projectId);
			if (!project || project.orgId !== auth.orgId) {
				report(req, auth, permission, 'hidden', projectId);
				return deps.mode === 'shadow' ? 'allowed' : 'hidden';
			}
			return this.checkProject(req, project, permission);
		},
	};
}
