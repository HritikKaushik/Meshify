import type {
	DocumentRepository,
	FileRepository,
	KnowledgeConnectorRepository,
	RepositoryRepository,
	SlackConversationRepository,
	SlackWorkspaceRepository,
} from '@meshify/data-access';

export class ConnectorNotFoundError extends Error {
	constructor(id: string) {
		super(`Connector "${id}" does not exist in this project`);
		this.name = 'ConnectorNotFoundError';
	}
}

/** Narrow port over the vector store — purges a connector's embedded chunks. */
export interface ConnectorVectorStore {
	deleteBySourcePaths(collection: string, paths: string[]): Promise<void>;
	deleteByFilter(collection: string, filters: { sourcePathExact: string }): Promise<void>;
}

/** Narrow port over object storage — deletes archives/uploads on teardown. */
export interface ConnectorObjectStore {
	deleteObject(key: string): Promise<void>;
}

export interface DeleteConnectorCommand {
	/** The isolation-guard-resolved project — carries both Qdrant collection names. */
	project: { id: string; qdrantCollectionDocs: string; qdrantCollectionCode: string };
	connectorId: string;
}

/**
 * Disconnects any knowledge source from a project. Dispatches on connector type
 * to purge the right vectors/blobs (reusing the same `deleteBySourcePaths`/
 * `deleteByFilter` helpers the per-source deletes use), then deletes the
 * connector row — its detail rows (`repositories`+`files`, `documents`, or
 * `slack_*`) cascade via their `connector_id` FK. External cleanup is
 * best-effort (logged, not fatal); the DB row is the source of truth.
 */
export class DeleteConnectorUseCase {
	constructor(
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly repositories: RepositoryRepository,
		private readonly files: FileRepository,
		private readonly documents: DocumentRepository,
		private readonly slackWorkspaces: SlackWorkspaceRepository,
		private readonly slackConversations: SlackConversationRepository,
		private readonly vectors: ConnectorVectorStore,
		private readonly storage: ConnectorObjectStore,
		private readonly logError: (context: Record<string, unknown>, message: string) => void = () => {}
	) {}

	async execute(command: DeleteConnectorCommand): Promise<void> {
		const connector = await this.connectors.findById(command.connectorId);
		if (!connector || connector.projectId !== command.project.id) throw new ConnectorNotFoundError(command.connectorId);

		if (connector.type === 'github') await this.teardownGitHub(connector.id, command.project);
		else if (connector.type === 'documents') await this.teardownDocuments(connector.id, command.project);
		else await this.teardownSlack(connector.id, command.project);

		await this.connectors.delete(connector.id);
	}

	private async teardownGitHub(connectorId: string, project: DeleteConnectorCommand['project']): Promise<void> {
		const repo = await this.repositories.findByConnectorId(connectorId);
		if (!repo) return;
		const files = await this.files.listByRepository(repo.id).catch(() => []);
		const paths = files.map((f) => f.path);
		if (paths.length > 0) {
			await this.vectors.deleteBySourcePaths(project.qdrantCollectionCode, paths).catch((err) => this.logError({ err, connectorId }, 'failed to delete repository vectors'));
		}
		if (repo.archiveObjectKey) {
			await this.storage.deleteObject(repo.archiveObjectKey).catch((err) => this.logError({ err, connectorId }, 'failed to delete repository archive'));
		}
	}

	private async teardownDocuments(connectorId: string, project: DeleteConnectorCommand['project']): Promise<void> {
		const docs = (await this.documents.listByProject(project.id)).filter((d) => d.connectorId === connectorId);
		for (const doc of docs) {
			await this.vectors
				.deleteByFilter(project.qdrantCollectionDocs, { sourcePathExact: doc.filename })
				.catch((err) => this.logError({ err, connectorId, documentId: doc.id }, 'failed to delete document vectors'));
			await this.storage.deleteObject(doc.objectStorageKey).catch((err) => this.logError({ err, connectorId, documentId: doc.id }, 'failed to delete document object'));
		}
	}

	private async teardownSlack(connectorId: string, project: DeleteConnectorCommand['project']): Promise<void> {
		const workspace = await this.slackWorkspaces.findByConnectorId(connectorId);
		if (!workspace) return;
		// Slack conversations are embedded in the project's `_documents` collection under `slack/...` source paths.
		const paths = await this.slackConversations.listSourcePathsByWorkspace(workspace.id).catch(() => []);
		if (paths.length > 0) {
			await this.vectors.deleteBySourcePaths(project.qdrantCollectionDocs, paths).catch((err) => this.logError({ err, connectorId }, 'failed to delete slack vectors'));
		}
	}
}
