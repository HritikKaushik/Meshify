import type { Project, ProjectRepository } from '@meshify/data-access';

export class ListProjectsUseCase {
	constructor(private readonly projects: ProjectRepository) {}

	async execute(orgId: string): Promise<Project[]> {
		return this.projects.findByOrgId(orgId);
	}
}
