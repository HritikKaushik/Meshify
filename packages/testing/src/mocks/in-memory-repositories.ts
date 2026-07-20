import type {
	Chat,
	ChatRepository,
	ChatSummary,
	ConnectorStatus,
	ConnectorType,
	CreateChatInput,
	CreateConnectorInput,
	CreateDocumentInput,
	CreateMessageInput,
	CreateProjectInput,
	CreateRepositoryInput,
	CreateSlackWorkspaceInput,
	Document,
	DocumentRepository,
	DocumentStatus,
	FileRepository,
	FileStatus,
	KnowledgeConnector,
	KnowledgeConnectorRepository,
	CreatePipelineJobInput,
	Message,
	PipelineJob,
	PipelineJobRepository,
	Project,
	ProjectRepository,
	RepoFile,
	Repository,
	RepositoryRepository,
	RepositorySyncStatus,
	SlackChannel,
	SlackChannelRepository,
	SlackConversation,
	SlackConversationRepository,
	SlackConversationStatus,
	SlackSyncState,
	SlackSyncStateRepository,
	SlackWorkspace,
	SlackWorkspaceRepository,
	UpdateChatInput,
	UpsertFileInput,
	UpsertSlackChannelInput,
	UpsertSlackConversationInput,
	Integration,
	CreateIntegrationInput,
	IntegrationStatus,
	IntegrationHealth,
	IntegrationRepository,
	IntegrationResource,
	IntegrationResourceRepository,
	UpsertIntegrationResourceInput,
	IntegrationCredential,
	IntegrationCredentialRepository,
	UpsertIntegrationCredentialInput,
	WebhookEvent,
	WebhookEventStatus,
	WebhookEventRepository,
	RecordWebhookEventInput,
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
			connectorId: input.connectorId ?? null,
			source: input.source,
			remoteUrl: input.remoteUrl ?? null,
			defaultBranch: null,
			lastSyncedCommit: null,
			syncStatus: 'pending',
			archiveObjectKey: input.archiveObjectKey ?? null,
			githubRepoId: input.githubRepoId ?? null,
			owner: input.owner ?? null,
			name: input.name ?? null,
			lastSyncedAt: null,
			createdAt: TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		this.repos.set(repo.id, repo);
		return repo;
	}

	async findById(id: string): Promise<Repository | undefined> {
		return this.repos.get(id);
	}

	async findByConnectorId(connectorId: string): Promise<Repository | undefined> {
		return [...this.repos.values()].find((r) => r.connectorId === connectorId);
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
		if (r) this.repos.set(id, { ...r, syncStatus: 'synced', lastSyncedCommit: commitSha ?? r.lastSyncedCommit, defaultBranch: defaultBranch ?? r.defaultBranch, lastSyncedAt: TEST_EPOCH });
	}

	async findByGitHubRepoId(githubRepoId: string): Promise<Repository[]> {
		return [...this.repos.values()].filter((r) => r.githubRepoId === githubRepoId);
	}

	async findByOwnerAndName(owner: string, name: string): Promise<Repository[]> {
		return [...this.repos.values()].filter((r) => r.owner?.toLowerCase() === owner.toLowerCase() && r.name?.toLowerCase() === name.toLowerCase());
	}

	async updateGitHubIdentity(id: string, input: { githubRepoId?: string; owner?: string; name?: string; remoteUrl?: string }): Promise<void> {
		const r = this.repos.get(id);
		if (r) {
			this.repos.set(id, {
				...r,
				githubRepoId: input.githubRepoId ?? r.githubRepoId,
				owner: input.owner ?? r.owner,
				name: input.name ?? r.name,
				remoteUrl: input.remoteUrl ?? r.remoteUrl,
			});
		}
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

	async findByRepositoryAndPaths(repositoryId: string, paths: string[]): Promise<RepoFile[]> {
		return this.files.filter((f) => f.repositoryId === repositoryId && paths.includes(f.path));
	}

	async updateStatusForPaths(repositoryId: string, paths: string[], status: FileStatus): Promise<void> {
		this.files = this.files.map((f) => (f.repositoryId === repositoryId && paths.includes(f.path) ? { ...f, status } : f));
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

export class InMemoryKnowledgeConnectorRepository implements KnowledgeConnectorRepository {
	private readonly connectors = new Map<string, KnowledgeConnector>();

	constructor(seed: KnowledgeConnector[] = []) {
		for (const c of seed) this.connectors.set(c.id, c);
	}

	async create(input: CreateConnectorInput): Promise<KnowledgeConnector> {
		const connector: KnowledgeConnector = {
			id: input.id,
			projectId: input.projectId,
			type: input.type,
			displayName: input.displayName,
			status: input.status ?? 'connecting',
			config: input.config ?? {},
			integrationId: input.integrationId ?? null,
			syncPolicy: input.syncPolicy ?? { trigger: 'event' },
			lastError: null,
			createdAt: TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		this.connectors.set(connector.id, connector);
		return connector;
	}

	async findById(id: string): Promise<KnowledgeConnector | undefined> {
		return this.connectors.get(id);
	}

	async listByProject(projectId: string): Promise<KnowledgeConnector[]> {
		return [...this.connectors.values()].filter((c) => c.projectId === projectId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	async findByProjectAndType(projectId: string, type: ConnectorType): Promise<KnowledgeConnector | undefined> {
		return [...this.connectors.values()].find((c) => c.projectId === projectId && c.type === type);
	}

	async listByIntegration(integrationId: string): Promise<KnowledgeConnector[]> {
		return [...this.connectors.values()].filter((c) => c.integrationId === integrationId);
	}

	async listEventTriggeredStale(before: Date): Promise<KnowledgeConnector[]> {
		return [...this.connectors.values()].filter(
			(c) => c.integrationId !== null && c.status === 'active' && c.syncPolicy.trigger === 'event' && c.updatedAt < before
		);
	}

	async listIntervalDue(now: Date): Promise<KnowledgeConnector[]> {
		return [...this.connectors.values()].filter((c) => {
			if (c.integrationId === null || c.status !== 'active' || c.syncPolicy.trigger !== 'interval') return false;
			const intervalMs = (c.syncPolicy.intervalMinutes ?? 60) * 60 * 1000;
			return c.updatedAt.getTime() < now.getTime() - intervalMs;
		});
	}

	async setIntegration(id: string, integrationId: string | null): Promise<void> {
		const c = this.connectors.get(id);
		if (c) this.connectors.set(id, { ...c, integrationId });
	}

	async updateStatus(id: string, status: ConnectorStatus, lastError?: string | null): Promise<void> {
		const c = this.connectors.get(id);
		if (c) this.connectors.set(id, { ...c, status, lastError: lastError ?? null });
	}

	async updateConfig(id: string, config: Record<string, unknown>): Promise<void> {
		const c = this.connectors.get(id);
		if (c) this.connectors.set(id, { ...c, config });
	}

	async delete(id: string): Promise<void> {
		this.connectors.delete(id);
	}
}

export class InMemorySlackWorkspaceRepository implements SlackWorkspaceRepository {
	private readonly workspaces = new Map<string, SlackWorkspace>();

	constructor(seed: SlackWorkspace[] = []) {
		for (const w of seed) this.workspaces.set(w.id, w);
	}

	async create(input: CreateSlackWorkspaceInput): Promise<SlackWorkspace> {
		const workspace: SlackWorkspace = {
			id: input.id,
			connectorId: input.connectorId,
			projectId: input.projectId,
			integrationId: input.integrationId ?? null,
			teamId: input.teamId,
			teamName: input.teamName ?? null,
			botUserId: input.botUserId ?? null,
			scope: input.scope ?? null,
			encryptedAccessToken: input.encryptedAccessToken ?? null,
			createdAt: TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		this.workspaces.set(workspace.id, workspace);
		return workspace;
	}

	async findById(id: string): Promise<SlackWorkspace | undefined> {
		return this.workspaces.get(id);
	}

	async findByConnectorId(connectorId: string): Promise<SlackWorkspace | undefined> {
		return [...this.workspaces.values()].find((w) => w.connectorId === connectorId);
	}

	async findByProjectAndTeam(projectId: string, teamId: string): Promise<SlackWorkspace | undefined> {
		return [...this.workspaces.values()].find((w) => w.projectId === projectId && w.teamId === teamId);
	}

	async listByProject(projectId: string): Promise<SlackWorkspace[]> {
		return [...this.workspaces.values()].filter((w) => w.projectId === projectId);
	}

	async listByIntegrationId(integrationId: string): Promise<SlackWorkspace[]> {
		return [...this.workspaces.values()].filter((w) => w.integrationId === integrationId);
	}

	async updateAccessToken(id: string, encryptedAccessToken: string, meta?: { scope?: string | null; botUserId?: string | null }): Promise<void> {
		const w = this.workspaces.get(id);
		if (w) this.workspaces.set(id, { ...w, encryptedAccessToken, scope: meta?.scope ?? w.scope, botUserId: meta?.botUserId ?? w.botUserId });
	}

	async delete(id: string): Promise<void> {
		this.workspaces.delete(id);
	}
}

export class InMemorySlackChannelRepository implements SlackChannelRepository {
	private channels: SlackChannel[] = [];

	constructor(seed: SlackChannel[] = []) {
		this.channels = [...seed];
	}

	async upsert(input: UpsertSlackChannelInput): Promise<SlackChannel> {
		const idx = this.channels.findIndex((c) => c.workspaceId === input.workspaceId && c.channelId === input.channelId);
		const existing = idx >= 0 ? this.channels[idx] : undefined;
		const channel: SlackChannel = {
			id: existing?.id ?? input.id,
			workspaceId: input.workspaceId,
			projectId: input.projectId,
			channelId: input.channelId,
			name: input.name ?? null,
			isPrivate: input.isPrivate ?? false,
			selected: existing?.selected ?? false,
			createdAt: existing?.createdAt ?? TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		if (idx >= 0) this.channels[idx] = channel;
		else this.channels.push(channel);
		return channel;
	}

	async findById(id: string): Promise<SlackChannel | undefined> {
		return this.channels.find((c) => c.id === id);
	}

	async listByWorkspace(workspaceId: string): Promise<SlackChannel[]> {
		return this.channels.filter((c) => c.workspaceId === workspaceId);
	}

	async listSelectedByWorkspace(workspaceId: string): Promise<SlackChannel[]> {
		return this.channels.filter((c) => c.workspaceId === workspaceId && c.selected);
	}

	async setSelected(workspaceId: string, selectedChannelIds: string[]): Promise<void> {
		const set = new Set(selectedChannelIds);
		this.channels = this.channels.map((c) => (c.workspaceId === workspaceId ? { ...c, selected: set.has(c.channelId) } : c));
	}
}

export class InMemorySlackConversationRepository implements SlackConversationRepository {
	private conversations: SlackConversation[] = [];

	constructor(seed: SlackConversation[] = []) {
		this.conversations = [...seed];
	}

	async upsert(input: UpsertSlackConversationInput): Promise<SlackConversation> {
		const idx = this.conversations.findIndex((c) => c.projectId === input.projectId && c.conversationKey === input.conversationKey);
		const conversation: SlackConversation = {
			id: idx >= 0 ? this.conversations[idx]!.id : input.id,
			projectId: input.projectId,
			workspaceId: input.workspaceId,
			slackChannelId: input.slackChannelId,
			channelId: input.channelId,
			channelName: input.channelName ?? null,
			conversationKey: input.conversationKey,
			sourcePath: input.sourcePath,
			threadTs: input.threadTs ?? null,
			tsStart: input.tsStart ?? null,
			tsEnd: input.tsEnd ?? null,
			permalink: input.permalink ?? null,
			participants: input.participants,
			messageCount: input.messageCount,
			reactionCount: input.reactionCount,
			visibility: input.visibility,
			contentHash: input.contentHash,
			status: 'pending',
			createdAt: idx >= 0 ? this.conversations[idx]!.createdAt : TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		if (idx >= 0) this.conversations[idx] = conversation;
		else this.conversations.push(conversation);
		return conversation;
	}

	async findByProjectAndKey(projectId: string, conversationKey: string): Promise<SlackConversation | undefined> {
		return this.conversations.find((c) => c.projectId === projectId && c.conversationKey === conversationKey);
	}

	async findByProjectAndSourcePath(projectId: string, sourcePath: string): Promise<SlackConversation | undefined> {
		return this.conversations.find((c) => c.projectId === projectId && c.sourcePath === sourcePath);
	}

	async listByWorkspace(workspaceId: string): Promise<SlackConversation[]> {
		return this.conversations.filter((c) => c.workspaceId === workspaceId);
	}

	async listByChannel(slackChannelId: string): Promise<SlackConversation[]> {
		return this.conversations.filter((c) => c.slackChannelId === slackChannelId);
	}

	async listSourcePathsByWorkspace(workspaceId: string): Promise<string[]> {
		return this.conversations.filter((c) => c.workspaceId === workspaceId).map((c) => c.sourcePath);
	}

	async updateStatus(id: string, status: SlackConversationStatus): Promise<void> {
		this.conversations = this.conversations.map((c) => (c.id === id ? { ...c, status } : c));
	}

	async findBySourcePaths(projectId: string, sourcePaths: string[]): Promise<SlackConversation[]> {
		return this.conversations.filter((c) => c.projectId === projectId && sourcePaths.includes(c.sourcePath));
	}

	async statsByWorkspace(workspaceId: string): Promise<{ total: number; embedded: number; lastUpdatedAt: Date | null }> {
		const rows = this.conversations.filter((c) => c.workspaceId === workspaceId);
		const embedded = rows.filter((c) => c.status === 'embedded').length;
		const lastUpdatedAt = rows.reduce<Date | null>((latest, c) => (!latest || c.updatedAt > latest ? c.updatedAt : latest), null);
		return { total: rows.length, embedded, lastUpdatedAt };
	}
}

export class InMemoryPipelineJobRepository implements PipelineJobRepository {
	private readonly jobs = new Map<string, PipelineJob>();

	constructor(seed: PipelineJob[] = []) {
		for (const j of seed) this.jobs.set(j.id, j);
	}

	async create(input: CreatePipelineJobInput): Promise<PipelineJob> {
		const job: PipelineJob = {
			id: input.id,
			projectId: input.projectId,
			jobType: input.jobType,
			status: 'queued',
			rocketrideToken: null,
			attempts: 0,
			lastError: null,
			payload: input.payload,
			dedupeKey: input.dedupeKey ?? null,
			progress: null,
			stage: null,
			createdAt: TEST_EPOCH,
			updatedAt: TEST_EPOCH,
			completedAt: null,
		};
		this.jobs.set(job.id, job);
		return job;
	}

	async createDeduped(input: CreatePipelineJobInput & { dedupeKey: string }): Promise<{ job: PipelineJob; created: boolean }> {
		const existing = [...this.jobs.values()].find((j) => j.dedupeKey === input.dedupeKey && j.status === 'queued');
		if (existing) return { job: existing, created: false };
		return { job: await this.create(input), created: true };
	}

	async findById(id: string): Promise<PipelineJob | undefined> {
		return this.jobs.get(id);
	}

	// Org isolation is enforced by the isolation guard in tests; the in-memory fake resolves by id.
	async findByIdForOrg(id: string, _orgId: string): Promise<PipelineJob | undefined> {
		return this.jobs.get(id);
	}

	async listActiveByProject(projectId: string): Promise<PipelineJob[]> {
		return [...this.jobs.values()]
			.filter((j) => j.projectId === projectId && (j.status === 'queued' || j.status === 'running'))
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	async listRecentByProject(projectId: string, limit: number): Promise<PipelineJob[]> {
		return [...this.jobs.values()].filter((j) => j.projectId === projectId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit);
	}

	async markRunning(id: string): Promise<void> {
		this.patch(id, { status: 'running', progress: 0 });
	}

	async updateProgress(id: string, progress: { stage: string; percent: number }): Promise<void> {
		this.patch(id, { stage: progress.stage, progress: Math.max(0, Math.min(100, Math.round(progress.percent))) });
	}

	async markCompleted(id: string): Promise<void> {
		this.patch(id, { status: 'completed', progress: 100, completedAt: TEST_EPOCH });
	}

	async markFailed(id: string, error: string, nextStatus: 'failed' | 'dead_letter'): Promise<void> {
		this.patch(id, { status: nextStatus, lastError: error });
	}

	async incrementAttempts(id: string): Promise<number> {
		const job = this.jobs.get(id);
		if (!job) return 0;
		const attempts = job.attempts + 1;
		this.patch(id, { attempts });
		return attempts;
	}

	private patch(id: string, partial: Partial<PipelineJob>): void {
		const job = this.jobs.get(id);
		if (job) this.jobs.set(id, { ...job, ...partial });
	}
}

export class InMemorySlackSyncStateRepository implements SlackSyncStateRepository {
	private readonly states = new Map<string, SlackSyncState>();

	constructor(seed: SlackSyncState[] = []) {
		for (const s of seed) this.states.set(s.slackChannelId, s);
	}

	async findByChannel(slackChannelId: string): Promise<SlackSyncState | undefined> {
		return this.states.get(slackChannelId);
	}

	async upsertCursor(input: { id: string; slackChannelId: string; projectId: string; lastSyncedTs: string | null }): Promise<SlackSyncState> {
		const existing = this.states.get(input.slackChannelId);
		const state: SlackSyncState = {
			id: existing?.id ?? input.id,
			slackChannelId: input.slackChannelId,
			projectId: input.projectId,
			lastSyncedTs: input.lastSyncedTs,
			lastSyncedAt: TEST_EPOCH,
			createdAt: existing?.createdAt ?? TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		this.states.set(input.slackChannelId, state);
		return state;
	}
}

export class InMemoryIntegrationRepository implements IntegrationRepository {
	private readonly integrations = new Map<string, Integration>();
	private seq = 0;

	constructor(seed: Integration[] = []) {
		for (const i of seed) this.integrations.set(i.id, i);
	}

	async create(input: CreateIntegrationInput): Promise<Integration> {
		this.seq += 1;
		const integration: Integration = {
			id: input.id ?? `int-${this.seq}`,
			orgId: input.orgId,
			provider: input.provider,
			mode: input.mode ?? 'managed',
			externalAccountId: input.externalAccountId,
			externalAccountName: input.externalAccountName ?? '',
			status: input.status ?? 'pending',
			health: 'unknown',
			healthDetail: {},
			healthCheckedAt: null,
			metadata: input.metadata ?? {},
			lastError: null,
			createdAt: TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		this.integrations.set(integration.id, integration);
		return integration;
	}

	async findById(id: string): Promise<Integration | undefined> {
		return this.integrations.get(id);
	}

	async findByIdForOrg(id: string, orgId: string): Promise<Integration | undefined> {
		const integration = this.integrations.get(id);
		return integration && integration.orgId === orgId ? integration : undefined;
	}

	async findByOrgProviderAccount(orgId: string, provider: string, externalAccountId: string): Promise<Integration | undefined> {
		return [...this.integrations.values()].find((i) => i.orgId === orgId && i.provider === provider && i.externalAccountId === externalAccountId);
	}

	async findByProviderAccount(provider: string, externalAccountId: string): Promise<Integration[]> {
		return [...this.integrations.values()].filter((i) => i.provider === provider && i.externalAccountId === externalAccountId);
	}

	async listByOrg(orgId: string): Promise<Integration[]> {
		return [...this.integrations.values()].filter((i) => i.orgId === orgId);
	}

	async listActiveByProvider(provider: string): Promise<Integration[]> {
		return [...this.integrations.values()].filter((i) => i.provider === provider && i.status === 'active');
	}

	async updateStatus(id: string, status: IntegrationStatus, lastError?: string | null): Promise<void> {
		const i = this.integrations.get(id);
		if (i) this.integrations.set(id, { ...i, status, lastError: lastError ?? null });
	}

	async updateHealth(id: string, health: IntegrationHealth, detail?: Record<string, unknown>): Promise<void> {
		const i = this.integrations.get(id);
		if (i) this.integrations.set(id, { ...i, health, healthDetail: detail ?? i.healthDetail, healthCheckedAt: TEST_EPOCH });
	}

	async updateAccountInfo(id: string, input: { externalAccountName?: string; metadata?: Record<string, unknown> }): Promise<void> {
		const i = this.integrations.get(id);
		if (i) {
			this.integrations.set(id, {
				...i,
				externalAccountName: input.externalAccountName ?? i.externalAccountName,
				metadata: { ...i.metadata, ...(input.metadata ?? {}) },
			});
		}
	}

	async delete(id: string): Promise<void> {
		this.integrations.delete(id);
	}
}

export class InMemoryIntegrationResourceRepository implements IntegrationResourceRepository {
	private readonly resources = new Map<string, IntegrationResource>();
	private seq = 0;

	private key(integrationId: string, resourceId: string): string {
		return `${integrationId}:${resourceId}`;
	}

	async upsertMany(inputs: UpsertIntegrationResourceInput[]): Promise<void> {
		for (const input of inputs) {
			const existing = this.resources.get(this.key(input.integrationId, input.resourceId));
			this.seq += 1;
			this.resources.set(this.key(input.integrationId, input.resourceId), {
				id: existing?.id ?? `res-${this.seq}`,
				integrationId: input.integrationId,
				workspaceId: input.workspaceId ?? null,
				resourceId: input.resourceId,
				kind: input.kind,
				name: input.name,
				private: input.private ?? false,
				metadata: input.metadata ?? {},
				discoveredAt: existing?.discoveredAt ?? TEST_EPOCH,
				updatedAt: TEST_EPOCH,
				removedAt: null,
			});
		}
	}

	async listByIntegration(integrationId: string, opts?: { includeRemoved?: boolean }): Promise<IntegrationResource[]> {
		return [...this.resources.values()].filter((r) => r.integrationId === integrationId && (opts?.includeRemoved || r.removedAt === null));
	}

	async findByResourceId(integrationId: string, resourceId: string): Promise<IntegrationResource | undefined> {
		return this.resources.get(this.key(integrationId, resourceId));
	}

	async markRemoved(integrationId: string, resourceIds: string[]): Promise<void> {
		for (const resourceId of resourceIds) {
			const r = this.resources.get(this.key(integrationId, resourceId));
			if (r) this.resources.set(this.key(integrationId, resourceId), { ...r, removedAt: TEST_EPOCH });
		}
	}

	async rename(integrationId: string, resourceId: string, name: string): Promise<void> {
		const r = this.resources.get(this.key(integrationId, resourceId));
		if (r) this.resources.set(this.key(integrationId, resourceId), { ...r, name });
	}

	async deleteAllForIntegration(integrationId: string): Promise<void> {
		for (const key of [...this.resources.keys()]) if (key.startsWith(`${integrationId}:`)) this.resources.delete(key);
	}
}

export class InMemoryWebhookEventRepository implements WebhookEventRepository {
	readonly events = new Map<string, WebhookEvent>();
	private seq = 0;

	async recordIfNew(input: RecordWebhookEventInput): Promise<WebhookEvent | undefined> {
		const duplicate = [...this.events.values()].some((e) => e.provider === input.provider && e.deliveryId === input.deliveryId);
		if (duplicate) return undefined;
		this.seq += 1;
		const event: WebhookEvent = {
			id: `wh-${this.seq}`,
			provider: input.provider,
			deliveryId: input.deliveryId,
			eventType: input.eventType,
			integrationId: input.integrationId ?? null,
			payload: input.payload,
			status: 'received',
			error: null,
			receivedAt: TEST_EPOCH,
			processedAt: null,
		};
		this.events.set(event.id, event);
		return event;
	}

	async findById(id: string): Promise<WebhookEvent | undefined> {
		return this.events.get(id);
	}

	async markStatus(id: string, status: WebhookEventStatus, error?: string | null): Promise<void> {
		const e = this.events.get(id);
		if (e) this.events.set(id, { ...e, status, error: error ?? null, processedAt: ['processed', 'skipped', 'failed'].includes(status) ? TEST_EPOCH : e.processedAt });
	}

	async listRecentByIntegration(integrationId: string, limit: number): Promise<WebhookEvent[]> {
		return [...this.events.values()].filter((e) => e.integrationId === integrationId).slice(0, limit);
	}

	async deleteTerminalBefore(_before: Date): Promise<number> {
		let removed = 0;
		for (const [id, e] of [...this.events]) {
			if (['processed', 'skipped', 'failed'].includes(e.status)) {
				this.events.delete(id);
				removed += 1;
			}
		}
		return removed;
	}
}

export class InMemoryIntegrationCredentialRepository implements IntegrationCredentialRepository {
	readonly credentials = new Map<string, IntegrationCredential>();
	private seq = 0;

	private key(integrationId: string, kind: string): string {
		return `${integrationId}:${kind}`;
	}

	async upsert(input: UpsertIntegrationCredentialInput): Promise<IntegrationCredential> {
		const existing = this.credentials.get(this.key(input.integrationId, input.kind));
		this.seq += 1;
		const credential: IntegrationCredential = {
			id: existing?.id ?? `cred-${this.seq}`,
			integrationId: input.integrationId,
			kind: input.kind,
			encryptedValue: input.encryptedValue,
			expiresAt: input.expiresAt ?? null,
			rotatedAt: existing ? TEST_EPOCH : null,
			createdAt: existing?.createdAt ?? TEST_EPOCH,
			updatedAt: TEST_EPOCH,
		};
		this.credentials.set(this.key(input.integrationId, input.kind), credential);
		return credential;
	}

	async findByIntegrationAndKind(integrationId: string, kind: string): Promise<IntegrationCredential | undefined> {
		return this.credentials.get(this.key(integrationId, kind));
	}

	async listByIntegration(integrationId: string): Promise<IntegrationCredential[]> {
		return [...this.credentials.values()].filter((c) => c.integrationId === integrationId);
	}

	async listExpiringBefore(before: Date): Promise<IntegrationCredential[]> {
		return [...this.credentials.values()].filter((c) => c.expiresAt !== null && c.expiresAt < before);
	}

	async delete(integrationId: string, kind: string): Promise<void> {
		this.credentials.delete(this.key(integrationId, kind));
	}

	async deleteAllForIntegration(integrationId: string): Promise<void> {
		for (const key of [...this.credentials.keys()]) if (key.startsWith(`${integrationId}:`)) this.credentials.delete(key);
	}
}
