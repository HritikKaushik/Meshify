import type { Repository, RepositoryRepository } from '@meshify/data-access';

export class ListRepositoriesUseCase {
	constructor(private readonly repositories: RepositoryRepository) {}

	async execute(projectId: string): Promise<Repository[]> {
		return this.repositories.listByProject(projectId);
	}
}
