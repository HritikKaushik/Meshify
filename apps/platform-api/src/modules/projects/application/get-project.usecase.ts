import type { Project } from '../domain/project.entity.js';
import type { ProjectRepository } from '../domain/project.repository.js';

export class GetProjectUseCase {
	constructor(private readonly projects: ProjectRepository) {}

	async execute(id: string): Promise<Project | undefined> {
		return this.projects.findById(id);
	}
}
