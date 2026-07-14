import type { Chat, ChatSummary, Document, Message, Project, RepoFile, Repository } from '@meshify/data-access';

/**
 * Deterministic domain factories. Every builder returns a valid entity with
 * sensible defaults and accepts a `Partial<T>` override — the single place test
 * data is shaped, so a schema change is fixed here once rather than across
 * dozens of inline literals.
 */

/** Fixed epoch so ordering/serialization assertions are stable across runs. */
export const TEST_EPOCH = new Date('2026-01-01T00:00:00.000Z');

export function buildProject(overrides: Partial<Project> = {}): Project {
	return {
		id: 'proj-1',
		orgId: 'org-1',
		name: 'payments-core',
		description: null,
		status: 'active',
		llmProfile: 'gpt-4o',
		embeddingProfile: 'text-embedding-3-small',
		qdrantCollectionDocs: 'proj_1_documents',
		qdrantCollectionCode: 'proj_1_code',
		rocketrideDocsIngestPipelineId: 'rr-docs-1',
		rocketrideCodeIngestPipelineId: 'rr-code-1',
		rocketrideChatPipelineId: 'rr-chat-1',
		createdAt: TEST_EPOCH,
		updatedAt: TEST_EPOCH,
		deletedAt: null,
		...overrides,
	};
}

export function buildChat(overrides: Partial<Chat> = {}): Chat {
	return {
		id: 'chat-1',
		projectId: 'proj-1',
		userId: null,
		title: 'Refund retry logic',
		pinned: false,
		createdAt: TEST_EPOCH,
		...overrides,
	};
}

export function buildChatSummary(overrides: Partial<ChatSummary> = {}): ChatSummary {
	return { ...buildChat(overrides), messageCount: 0, ...overrides };
}

export function buildMessage(overrides: Partial<Message> = {}): Message {
	return {
		id: 'msg-1',
		chatId: 'chat-1',
		role: 'user',
		content: 'Who gets paged on a MANUAL_REVIEW refund?',
		citations: [],
		latencyMs: null,
		modelUsed: null,
		tokensUsed: null,
		createdAt: TEST_EPOCH,
		...overrides,
	};
}

export function buildDocument(overrides: Partial<Document> = {}): Document {
	return {
		id: 'doc-1',
		projectId: 'proj-1',
		sourceType: 'md',
		filename: 'refund-runbook.md',
		objectStorageKey: 'projects/proj-1/documents/doc-1/refund-runbook.md',
		contentHash: 'hash-1',
		status: 'pending',
		createdAt: TEST_EPOCH,
		updatedAt: TEST_EPOCH,
		...overrides,
	};
}

export function buildRepository(overrides: Partial<Repository> = {}): Repository {
	return {
		id: 'repo-1',
		projectId: 'proj-1',
		source: 'github',
		remoteUrl: 'https://github.com/acme/payments-core',
		defaultBranch: 'main',
		lastSyncedCommit: null,
		syncStatus: 'pending',
		archiveObjectKey: null,
		createdAt: TEST_EPOCH,
		updatedAt: TEST_EPOCH,
		...overrides,
	};
}

export function buildRepoFile(overrides: Partial<RepoFile> = {}): RepoFile {
	return {
		id: 'file-1',
		projectId: 'proj-1',
		repositoryId: 'repo-1',
		path: 'src/index.ts',
		language: 'typescript',
		sizeBytes: 128,
		contentHash: 'fh-1',
		objectStorageKey: null,
		status: 'pending',
		createdAt: TEST_EPOCH,
		updatedAt: TEST_EPOCH,
		...overrides,
	};
}
