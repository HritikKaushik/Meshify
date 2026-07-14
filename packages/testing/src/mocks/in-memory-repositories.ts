import type {
	Chat,
	ChatRepository,
	ChatSummary,
	CreateChatInput,
	CreateDocumentInput,
	CreateMessageInput,
	CreateProjectInput,
	CreateRepositoryInput,
	Document,
	DocumentRepository,
	DocumentStatus,
	FileRepository,
	FileStatus,
	Message,
	Project,
	ProjectRepository,
	RepoFile,
	Repository,
	RepositoryRepository,
	RepositorySyncStatus,
	UpdateChatInput,
	UpsertFileInput,
} from '@meshify/data-access';
import { TEST_EPOCH } from '../factories/entities.js';

/**
 * Fully in-memory implementations of the data-access repository ports — the
 * single reusable substitute for the ad-hoc inline fakes that used to be copied
 * across use-case tests. Each implements its full interface, so a port change
 * surfaces here at compile time. Seed via the constructor; behaviour mirrors the
 * Postgres repositories (ordering, cascade, dedupe, aggregates).
 */

export class InMemoryChatRepository implements ChatRepository {
	private readonly chats = new Map<string, Chat>();
	private messages: Message[] = [];
	private clock = TEST_EPOCH.getTime();

	constructor(seed: { chats?: Chat[]; messages?: Message[] } = {}) {
		for (const c of seed.chats ?? []) this.chats.set(c.id, c);
		this.messages = [...(seed.messages ?? [])];
	}

	private nextDate(): Date {
		return new Date(this.clock++);
	}

	async createChat(input: CreateChatInput): Promise<Chat> {
		const chat: Chat = { id: input.id, projectId: input.projectId, userId: input.userId ?? null, title: input.title ?? null, pinned: false, createdAt: this.nextDate() };
		this.chats.set(chat.id, chat);
		return chat;
	}

	async findChatById(id: string): Promise<Chat | undefined> {
		return this.chats.get(id);
	}

	async findByProjectId(projectId: string): Promise<ChatSummary[]> {
		return [...this.chats.values()]
			.filter((c) => c.projectId === projectId)
			.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.getTime() - a.createdAt.getTime())
			.map((c) => ({ ...c, messageCount: this.messages.filter((m) => m.chatId === c.id).length }));
	}

	async countByProject(projectId: string): Promise<number> {
		return [...this.chats.values()].filter((c) => c.projectId === projectId).length;
	}

	async updateChat(id: string, patch: UpdateChatInput): Promise<Chat | undefined> {
		const existing = this.chats.get(id);
		if (!existing) return undefined;
		const updated: Chat = {
			...existing,
			...(patch.title !== undefined ? { title: patch.title } : {}),
			...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
		};
		this.chats.set(id, updated);
		return updated;
	}

	async deleteChat(id: string): Promise<void> {
		this.chats.delete(id);
		this.messages = this.messages.filter((m) => m.chatId !== id);
	}

	async createMessage(input: CreateMessageInput): Promise<Message> {
		const message: Message = {
			id: input.id,
			chatId: input.chatId,
			role: input.role,
			content: input.content,
			citations: input.citations ?? [],
			latencyMs: input.latencyMs ?? null,
			modelUsed: input.modelUsed ?? null,
			tokensUsed: input.tokensUsed ?? null,
			createdAt: this.nextDate(),
		};
		this.messages.push(message);
		return message;
	}

	async listMessages(chatId: string, limit = 50): Promise<Message[]> {
		const ordered = this.messages.filter((m) => m.chatId === chatId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
		return ordered.slice(Math.max(0, ordered.length - limit));
	}
}

export class InMemoryDocumentRepository implements DocumentRepository {
	private readonly docs = new Map<string, Document>();

	constructor(seed: Document[] = []) {
		for (const d of seed) this.docs.set(d.id, d);
	}

	async create(input: CreateDocumentInput): Promise<Document> {
		const doc: Document = { ...input, status: 'pending', createdAt: TEST_EPOCH, updatedAt: TEST_EPOCH };
		this.docs.set(doc.id, doc);
		return doc;
	}

	async findById(id: string): Promise<Document | undefined> {
		return this.docs.get(id);
	}

	async listByProject(projectId: string): Promise<Document[]> {
		return [...this.docs.values()].filter((d) => d.projectId === projectId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async statsByProject(projectId: string): Promise<{ total: number; embedded: number; lastUpdatedAt: Date | null }> {
		const rows = [...this.docs.values()].filter((d) => d.projectId === projectId);
		const embedded = rows.filter((d) => d.status === 'embedded').length;
		const lastUpdatedAt = rows.reduce<Date | null>((latest, d) => (!latest || d.updatedAt > latest ? d.updatedAt : latest), null);
		return { total: rows.length, embedded, lastUpdatedAt };
	}

	async findByProjectAndHash(projectId: string, contentHash: string): Promise<Document | undefined> {
		return [...this.docs.values()]
			.filter((d) => d.projectId === projectId && d.contentHash === contentHash)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
	}

	async updateStatus(id: string, status: DocumentStatus): Promise<void> {
		const d = this.docs.get(id);
		if (d) this.docs.set(id, { ...d, status });
	}

	async delete(id: string): Promise<void> {
		this.docs.delete(id);
	}
}

export class InMemoryRepositoryRepository implements RepositoryRepository {
	private readonly repos = new Map<string, Repository>();

	constructor(seed: Repository[] = []) {
		for (const r of seed) this.repos.set(r.id, r);
	}

	async create(input: CreateRepositoryInput): Promise<Repository> {
		const repo: Repository = {
			id: input.id,
			projectId: input.projectId,
			source: input.source,
			remoteUrl: input.remoteUrl ?? null,
			defaultBranch: null,
			lastSyncedCommit: null,
			syncStatus: 'pending',
			archiveObjectKey: input.archiveObjectKey ?? null,
			createdAt: TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		this.repos.set(repo.id, repo);
		return repo;
	}

	async findById(id: string): Promise<Repository | undefined> {
		return this.repos.get(id);
	}

	async listByProject(projectId: string): Promise<Repository[]> {
		return [...this.repos.values()].filter((r) => r.projectId === projectId);
	}

	async statsByProject(projectId: string): Promise<{ total: number; synced: number; lastUpdatedAt: Date | null }> {
		const rows = [...this.repos.values()].filter((r) => r.projectId === projectId);
		const synced = rows.filter((r) => r.syncStatus === 'synced').length;
		const lastUpdatedAt = rows.reduce<Date | null>((latest, r) => (!latest || r.updatedAt > latest ? r.updatedAt : latest), null);
		return { total: rows.length, synced, lastUpdatedAt };
	}

	async updateSyncStatus(id: string, status: RepositorySyncStatus): Promise<void> {
		const r = this.repos.get(id);
		if (r) this.repos.set(id, { ...r, syncStatus: status });
	}

	async markSynced(id: string, commitSha: string | null, defaultBranch: string | null): Promise<void> {
		const r = this.repos.get(id);
		if (r) this.repos.set(id, { ...r, syncStatus: 'synced', lastSyncedCommit: commitSha ?? r.lastSyncedCommit, defaultBranch: defaultBranch ?? r.defaultBranch });
	}

	async delete(id: string): Promise<void> {
		this.repos.delete(id);
	}
}

export class InMemoryFileRepository implements FileRepository {
	private files: RepoFile[] = [];

	constructor(seed: RepoFile[] = []) {
		this.files = [...seed];
	}

	async upsert(input: UpsertFileInput): Promise<RepoFile> {
		const file: RepoFile = {
			id: input.id,
			projectId: input.projectId,
			repositoryId: input.repositoryId,
			path: input.path,
			language: input.language,
			sizeBytes: input.sizeBytes,
			contentHash: input.contentHash,
			objectStorageKey: null,
			status: 'pending',
			createdAt: TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		const idx = this.files.findIndex((f) => f.repositoryId === input.repositoryId && f.path === input.path);
		if (idx >= 0) this.files[idx] = file;
		else this.files.push(file);
		return file;
	}

	async listByRepository(repositoryId: string): Promise<RepoFile[]> {
		return this.files.filter((f) => f.repositoryId === repositoryId);
	}

	async updateStatusByRepository(repositoryId: string, from: FileStatus, to: FileStatus): Promise<void> {
		this.files = this.files.map((f) => (f.repositoryId === repositoryId && f.status === from ? { ...f, status: to } : f));
	}

	async markDeleted(repositoryId: string, paths: string[]): Promise<void> {
		const set = new Set(paths);
		this.files = this.files.map((f) => (f.repositoryId === repositoryId && set.has(f.path) ? { ...f, status: 'deleted' } : f));
	}
}

export class InMemoryProjectRepository implements ProjectRepository {
	private readonly projects = new Map<string, Project>();
	private readonly orgs: Set<string>;

	constructor(seed: { projects?: Project[]; orgs?: string[] } = {}) {
		for (const p of seed.projects ?? []) this.projects.set(p.id, p);
		this.orgs = new Set(seed.orgs ?? (seed.projects ?? []).map((p) => p.orgId));
	}

	async orgExists(orgId: string): Promise<boolean> {
		return this.orgs.has(orgId);
	}

	async create(input: CreateProjectInput): Promise<Project> {
		const project: Project = { ...input, status: 'active', createdAt: TEST_EPOCH, updatedAt: TEST_EPOCH, deletedAt: null };
		this.projects.set(project.id, project);
		return project;
	}

	async findById(id: string): Promise<Project | undefined> {
		return this.projects.get(id);
	}

	async findByOrgId(orgId: string): Promise<Project[]> {
		return [...this.projects.values()].filter((p) => p.orgId === orgId);
	}

	async delete(id: string): Promise<void> {
		this.projects.delete(id);
	}
}
