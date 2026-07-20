import type { FileRepository, KnowledgeConnector, RepositoryRepository, SlackConversationRepository } from '@meshify/data-access';
import type { ContentLedger } from '@meshify/providers';

/**
 * ContentLedger adapters: the engine's change-detection memory, backed by each
 * source's existing detail tables so ledger state and detail rows can never
 * disagree. A hash is "known" only once its content is durably embedded —
 * pending rows re-embed on retry, exactly like before the engine existed.
 */

export function createGitHubContentLedger(deps: { repositories: RepositoryRepository; files: FileRepository }): (connector: KnowledgeConnector) => ContentLedger {
	return (connector) => {
		// Resolve the repository row once per sync, not once per batch — the
		// engine calls getHashes/setHashes/deleteRefs per 25-item batch.
		let repoIdPromise: Promise<string | undefined> | undefined;
		const repoId = () => (repoIdPromise ??= deps.repositories.findByConnectorId(connector.id).then((r) => r?.id));
		return {
			async getHashes(_connectorId, sourceRefs) {
				const id = await repoId();
				if (!id) return new Map();
				const rows = await deps.files.findByRepositoryAndPaths(id, sourceRefs);
				return new Map(rows.filter((f) => f.status === 'embedded').map((f) => [f.path, f.contentHash]));
			},
			async setHashes(_connectorId, entries) {
				const id = await repoId();
				if (!id) return;
				// The sync already upserted the rows (with hash) as pending; the
				// engine's post-embed stamp flips exactly the embedded paths.
				await deps.files.updateStatusForPaths(id, entries.map((e) => e.sourceRef), 'embedded');
			},
			async deleteRefs(_connectorId, sourceRefs) {
				const id = await repoId();
				if (!id) return;
				await deps.files.markDeleted(id, sourceRefs);
			},
		};
	};
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
