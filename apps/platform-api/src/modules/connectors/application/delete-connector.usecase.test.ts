import { describe, expect, it, vi } from 'vitest';
import {
	InMemoryDocumentRepository,
	InMemoryFileRepository,
	InMemoryKnowledgeConnectorRepository,
	InMemoryRepositoryRepository,
	InMemorySlackConversationRepository,
	InMemorySlackWorkspaceRepository,
	buildDocument,
	buildKnowledgeConnector,
	buildRepoFile,
	buildRepository,
	buildSlackConversation,
	buildSlackWorkspace,
} from '@meshify/testing';
import { ConnectorNotFoundError, DeleteConnectorUseCase } from './delete-connector.usecase.js';

const PROJECT = { id: 'proj-1', qdrantCollectionDocs: 'proj_1_documents', qdrantCollectionCode: 'proj_1_code' };

function makeDeps(seed: {
	connectors?: Parameters<typeof buildKnowledgeConnector>[0][];
	repositories?: ReturnType<typeof buildRepository>[];
	files?: ReturnType<typeof buildRepoFile>[];
	documents?: ReturnType<typeof buildDocument>[];
	workspaces?: ReturnType<typeof buildSlackWorkspace>[];
	conversations?: ReturnType<typeof buildSlackConversation>[];
}) {
	const connectors = new InMemoryKnowledgeConnectorRepository((seed.connectors ?? []).map((o) => buildKnowledgeConnector(o)));
	const repositories = new InMemoryRepositoryRepository(seed.repositories ?? []);
	const files = new InMemoryFileRepository(seed.files ?? []);
	const documents = new InMemoryDocumentRepository(seed.documents ?? []);
	const workspaces = new InMemorySlackWorkspaceRepository(seed.workspaces ?? []);
	const conversations = new InMemorySlackConversationRepository(seed.conversations ?? []);
	const vectors = { deleteBySourcePaths: vi.fn(async () => {}), deleteByFilter: vi.fn(async () => {}) };
	const storage = { deleteObject: vi.fn(async () => {}) };
	const usecase = new DeleteConnectorUseCase(connectors, repositories, files, documents, workspaces, conversations, vectors, storage);
	return { usecase, connectors, vectors, storage };
}

describe('DeleteConnectorUseCase', () => {
	it('github: purges code vectors by file path, deletes the archive, removes the connector', async () => {
		const { usecase, connectors, vectors, storage } = makeDeps({
			connectors: [{ id: 'c-gh', type: 'github' }],
			repositories: [buildRepository({ id: 'r1', connectorId: 'c-gh', source: 'zip', archiveObjectKey: 'a.zip' })],
			files: [buildRepoFile({ id: 'f1', repositoryId: 'r1', path: 'src/a.ts' })],
		});
		await usecase.execute({ project: PROJECT, connectorId: 'c-gh' });
		expect(vectors.deleteBySourcePaths).toHaveBeenCalledWith('proj_1_code', ['src/a.ts']);
		expect(storage.deleteObject).toHaveBeenCalledWith('a.zip');
		expect(await connectors.findById('c-gh')).toBeUndefined();
	});

	it('documents: purges each document’s vectors (docs collection) + object, removes the connector', async () => {
		const { usecase, connectors, vectors, storage } = makeDeps({
			connectors: [{ id: 'c-docs', type: 'documents' }],
			documents: [
				buildDocument({ id: 'd1', connectorId: 'c-docs', filename: 'runbook.md', objectStorageKey: 'k1', contentHash: 'h1' }),
				buildDocument({ id: 'd2', connectorId: 'c-docs', filename: 'notes.md', objectStorageKey: 'k2', contentHash: 'h2' }),
			],
		});
		await usecase.execute({ project: PROJECT, connectorId: 'c-docs' });
		expect(vectors.deleteByFilter).toHaveBeenCalledWith('proj_1_documents', { sourcePathExact: 'runbook.md' });
		expect(vectors.deleteByFilter).toHaveBeenCalledWith('proj_1_documents', { sourcePathExact: 'notes.md' });
		expect(storage.deleteObject).toHaveBeenCalledTimes(2);
		expect(await connectors.findById('c-docs')).toBeUndefined();
	});

	it('slack: purges conversation vectors (docs collection) by source path, removes the connector', async () => {
		const { usecase, connectors, vectors } = makeDeps({
			connectors: [{ id: 'c-slk', type: 'slack' }],
			workspaces: [buildSlackWorkspace({ id: 'ws-1', connectorId: 'c-slk' })],
			conversations: [
				buildSlackConversation({ id: 's1', workspaceId: 'ws-1', sourcePath: 'slack/T/C/t1' }),
				buildSlackConversation({ id: 's2', workspaceId: 'ws-1', sourcePath: 'slack/T/C/t2', conversationKey: 'C/t2' }),
			],
		});
		await usecase.execute({ project: PROJECT, connectorId: 'c-slk' });
		expect(vectors.deleteBySourcePaths).toHaveBeenCalledWith('proj_1_documents', ['slack/T/C/t1', 'slack/T/C/t2']);
		expect(await connectors.findById('c-slk')).toBeUndefined();
	});

	it('rejects a connector owned by another project (isolation)', async () => {
		const { usecase, connectors } = makeDeps({ connectors: [{ id: 'c-x', type: 'slack', projectId: 'someone-else' }] });
		await expect(usecase.execute({ project: PROJECT, connectorId: 'c-x' })).rejects.toBeInstanceOf(ConnectorNotFoundError);
		expect(await connectors.findById('c-x')).toBeDefined();
	});
});
