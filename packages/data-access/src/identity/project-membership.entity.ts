/**
 * A person's role in one project. `roleKey` names a role in the code-defined
 * catalog (@meshify/authz); the database only checks its shape, so adding a
 * built-in role needs no migration.
 */
export interface ProjectMembership {
	id: string;
	orgId: string;
	projectId: string;
	userId: string;
	roleKey: string;
	addedByUserId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** A project membership joined with the person it belongs to. */
export interface ProjectMember extends ProjectMembership {
	email: string | null;
	displayName: string | null;
	avatarUrl: string | null;
}
