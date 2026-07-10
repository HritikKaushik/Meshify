import type { Project, ProjectRepository } from '@meshify/data-access';

export class GetProjectUseCase {
	constructor(private readonly projects: ProjectRepository) {}

	async execute(id: string): Promise<Project | undefined> {
		return this.projects.findById(id);
	}
}
