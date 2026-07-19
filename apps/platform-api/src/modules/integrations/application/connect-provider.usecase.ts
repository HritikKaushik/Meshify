import type { ProjectRepository } from '@meshify/data-access';
import type { OAuthStateService, ProviderRegistry } from '@meshify/providers';
import { ProviderNotConfiguredError, supportsOAuth } from '@meshify/providers';
import { UnsupportedProviderOperationError } from './integration-support.js';

export interface ConnectProviderCommand {
	orgId: string;
	provider: string;
	/** Auto-open the resource picker for this project after the round-trip. */
	projectId?: string;
	returnPath?: string;
	createdByKeyId?: string;
}

export class ProjectNotInOrgError extends Error {
	constructor() {
		super('Project not found');
		this.name = 'ProjectNotInOrgError';
	}
}

/**
 * Begin an org-level connect: issue the single-use state and build the
 * provider's consent/install URL. The state row is the only thing that can
 * later bind the callback to this org — the URL itself carries no identity.
 */
export class ConnectProviderUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly states: OAuthStateService,
		private readonly projects: ProjectRepository
	) {}

	async execute(command: ConnectProviderCommand): Promise<{ url: string }> {
		const provider = this.registry.get(command.provider);
		if (!supportsOAuth(provider)) throw new UnsupportedProviderOperationError(command.provider, 'connect');
		if (provider.isConfigured?.() === false) throw new ProviderNotConfiguredError(command.provider);

		if (command.projectId) {
			const project = await this.projects.findById(command.projectId);
			if (!project || project.orgId !== command.orgId) throw new ProjectNotInOrgError();
		}

		const { token } = await this.states.issue({
			orgId: command.orgId,
			provider: command.provider,
			projectId: command.projectId ?? null,
			returnPath: command.returnPath ?? null,
			intent: 'connect',
			createdByKeyId: command.createdByKeyId ?? null,
		});

		return { url: provider.buildConnectUrl({ stateToken: token, intent: 'connect' }) };
	}
}
