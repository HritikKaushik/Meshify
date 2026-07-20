import type { FileRepository, KnowledgeConnector, RepositoryRepository, SlackConversationRepository } from '@meshify/data-access';
import type { ContentLedger } from '@meshify/providers';

/**
 * ContentLedger adapters: the engine's change-detection memory, backed by each
 * source's existing detail tables so ledger state and detail rows can never
 * disagree. A hash is "known" only once its content is durably embedded —
 * pending rows re-embed on retry, exactly like before the engine existed.
 */

export function createGitHubContentLedger(deps: { repositories: RepositoryRepository; files: FileRepository }): (connector: KnowledgeConnector) => ContentLedger {
	return (connector) => ({
		async getHashes(_connectorId, sourceRefs) {
			const repository = await deps.repositories.findByConnectorId(connector.id);
			if (!repository) return new Map();
			const rows = await deps.files.findByRepositoryAndPaths(repository.id, sourceRefs);
			return new Map(rows.filter((f) => f.status === 'embedded').map((f) => [f.path, f.contentHash]));
		},
		async setHashes(_connectorId, entries) {
			const repository = await deps.repositories.findByConnectorId(connector.id);
			if (!repository) return;
			// The sync already upserted the rows (with hash) as pending; the
			// engine's post-embed stamp flips exactly the embedded paths.
			await deps.files.updateStatusForPaths(repository.id, entries.map((e) => e.sourceRef), 'embedded');
		},
		async deleteRefs(_connectorId, sourceRefs) {
			const repository = await deps.repositories.findByConnectorId(connector.id);
			if (!repository) return;
			await deps.files.markDeleted(repository.id, sourceRefs);
		},
	});
}

export function createSlackContentLedger(deps: { conversations: SlackConversationRepository }): (connector: KnowledgeConnector) => ContentLedger {
	return (connector) => ({
		async getHashes(_connectorId, sourceRefs) {
			const rows = await deps.conversations.findBySourcePaths(connector.projectId, sourceRefs);
			return new Map(rows.filter((c) => c.status === 'embedded').map((c) => [c.sourcePath, c.contentHash]));
		},
		async setHashes(_connectorId, entries) {
			const rows = await deps.conversations.findBySourcePaths(connector.projectId, entries.map((e) => e.sourceRef));
			for (const row of rows) await deps.conversations.updateStatus(row.id, 'embedded');
		},
		async deleteRefs(_connectorId, sourceRefs) {
			const rows = await deps.conversations.findBySourcePaths(connector.projectId, sourceRefs);
			for (const row of rows) await deps.conversations.updateStatus(row.id, 'deleted');
		},
	});
}
