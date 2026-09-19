import type { ProjectMember, ProjectMembership } from './project-membership.entity.js';

export interface UpsertProjectMembershipInput {
	orgId: string;
	projectId: string;
	userId: string;
	roleKey: string;
	addedByUserId?: string | null;
}

export interface ProjectMembershipRepository {
	findByProjectAndUser(projectId: string, userId: string): Promise<ProjectMembership | undefined>;
	listByProject(projectId: string): Promise<ProjectMember[]>;
	/**
	 * Idempotent grant: inserts, or changes the role of an existing row.
	 * `previousRoleKey` is undefined for a fresh grant, so the caller can tell
	 * "added" from "role changed" when it writes the audit event.
	 */
	upsert(input: UpsertProjectMembershipInput): Promise<{ membership: ProjectMembership; previousRoleKey: string | undefined }>;
	remove(projectId: string, userId: string): Promise<ProjectMembership | undefined>;
}
