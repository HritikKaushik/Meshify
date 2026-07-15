// Minimal typed client for the Meshify BFF (apps/bff), which proxies to
// platform-api. One place that knows the wire shape; pages call these
// methods. Errors carry the HTTP status and the server's error body so the
// UI can show exactly what happened.
//
// Auth: the BFF is Clerk-session-authenticated. The browser never holds a
// platform-api key — every call sends `credentials: 'include'` so the Clerk
// session cookie rides along; the BFF resolves it to the org's real API key
// server-side. There is nothing to configure client-side beyond the base URL.

export interface ApiConfig {
	/** Base URL. Empty string → same-origin (dev proxy forwards /api to the BFF). */
	baseUrl: string;
}

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public body?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export interface Project {
	id: string;
	orgId: string;
	name: string;
	description: string | null;
	status: string;
	llmProfile: string;
	embeddingProfile: string;
	createdAt: string;
	updatedAt: string;
}

export interface UploadResult {
	documentId: string;
	status: string;
	jobId?: string;
	deduped: boolean;
}

export interface Job {
	id: string;
	projectId: string;
	jobType: string;
	status: string;
	attempts: number;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
}

export interface SearchHit {
	id: string;
	collection: 'documents' | 'code';
	/** The knowledge source — distinguishes GitHub, Documents, and Slack. */
	source?: 'github' | 'documents' | 'slack';
	sourcePath: string;
	score: number;
	content: string | null;
	chunkIndex: number | null;
}

export interface SearchResponse {
	query: string;
	mode: string;
	degradedTo?: string;
	warning?: string;
	results: SearchHit[];
}

export interface SlackCitationMeta {
	channel: string | null;
	channelId: string;
	threadTs: string | null;
	author: string | null;
	participants: string[];
	timestamp: string | null;
	permalink: string | null;
}

export interface ChatCitation {
	sourcePath: string;
	chunkId?: string;
	score: number;
	source?: 'github' | 'documents' | 'slack';
	slack?: SlackCitationMeta;
}

export interface ChatResponse {
	conversationId: string;
	messageId: string;
	answer: string;
	citations: ChatCitation[];
	confidence: number;
	retrievedDocuments: Array<{ id: string; sourcePath: string; score: number }>;
	referencedCodeFiles: string[];
	latencyMs: number;
	modelUsed: string | null;
	tokenUsage: { prompt: number; completion: number; total: number } | null;
}

export interface Conversation {
	id: string;
	title: string | null;
	pinned: boolean;
	messageCount: number;
	createdAt: string;
}

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	citations: ChatCitation[];
	latencyMs: number | null;
	modelUsed: string | null;
	tokensUsed: number | null;
	createdAt: string;
}

export interface GoldenCase {
	id: string;
	question: string;
	expectedKeywords?: string[];
	anyKeywords?: string[];
	forbiddenKeywords?: string[];
	expectedSources?: string[];
	minConfidence?: number;
}

export interface EvaluationReport {
	projectId: string;
	total: number;
	passed: number;
	failed: number;
	passRate: number;
	averageConfidence: number;
	averageLatencyMs: number;
	totalTokens: number;
	durationMs: number;
	cases: Array<{
		id: string;
		question: string;
		passed: boolean;
		answer: string;
		confidence: number;
		latencyMs: number;
		tokens: number;
		citations: string[];
		checks: Array<{ check: string; passed: boolean; detail: string }>;
		error?: string;
	}>;
}

export interface Repository {
	id: string;
	projectId: string;
	source: string;
	remoteUrl: string | null;
	defaultBranch: string | null;
	syncStatus: string;
	lastError?: string | null;
	createdAt: string;
}

export interface DocumentSummary {
	id: string;
	filename: string;
	sourceType: 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'readme';
	status: 'pending' | 'parsed' | 'embedded' | 'failed';
	createdAt: string;
	updatedAt: string;
}

export type ConnectorType = 'github' | 'documents' | 'slack';
export type ConnectorStatus = 'connecting' | 'active' | 'error' | 'disconnected';

/** A unified knowledge source (GitHub, Documents, or Slack) as returned by the connectors list. */
export interface Connector {
	id: string;
	type: ConnectorType;
	displayName: string;
	status: ConnectorStatus;
	itemCount: number;
	embeddedCount: number;
	lastActivityAt: string | null;
	detail: Record<string, unknown>;
	createdAt: string;
}

export interface SlackChannelSummary {
	id: string;
	channelId: string;
	name: string | null;
	isPrivate: boolean;
	selected: boolean;
}

export interface ProjectStats {
	repositories: { total: number; synced: number };
	documents: { total: number; embedded: number };
	conversations: number;
	/** Fraction of documents embedded (0–1), or null when the project has no documents. */
	coverage: number | null;
	lastActivityAt: string | null;
}

export interface HealthReport {
	status: string;
	dependencies?: Array<{ name: string; status: string; latencyMs: number }>;
}

export class MeshifyApi {
	constructor(private cfg: ApiConfig) {}

	private url(path: string): string {
		return `${this.cfg.baseUrl}${path}`;
	}

	private async parse<T>(res: Response): Promise<T> {
		const text = await res.text();
		const body = text ? safeJson(text) : undefined;
		if (!res.ok) {
			let message = res.statusText;
			if (body && typeof body === 'object' && 'error' in body) message = String((body as { error: unknown }).error);
			throw new ApiError(res.status, message, body);
		}
		return body as T;
	}

	// --- Health (no auth) ---
	async health(): Promise<HealthReport> {
		return this.parse(await fetch(this.url('/api/health')));
	}

	// --- Projects ---
	async listProjects(): Promise<Project[]> {
		return this.parse(await fetch(this.url('/api/v1/projects'), { credentials: 'include' }));
	}

	async createProject(input: { name: string; description?: string; llmProfile?: string; embeddingProfile?: string }): Promise<Project> {
		return this.parse(
			await fetch(this.url('/api/v1/projects'), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input),
			})
		);
	}

	async getProject(id: string): Promise<Project> {
		return this.parse(await fetch(this.url(`/api/v1/projects/${id}`), { credentials: 'include' }));
	}

	/** Real aggregate counts for a project (repositories, documents, conversations, coverage). */
	async getProjectStats(id: string): Promise<ProjectStats> {
		return this.parse(await fetch(this.url(`/api/v1/projects/${id}/stats`), { credentials: 'include' }));
	}

	async deleteProject(id: string): Promise<void> {
		const res = await fetch(this.url(`/api/v1/projects/${id}`), { method: 'DELETE', credentials: 'include' });
		if (!res.ok && res.status !== 204) await this.parse(res);
	}

	// --- Documents & jobs ---
	async uploadDocument(projectId: string, file: File): Promise<UploadResult> {
		const form = new FormData();
		form.append('file', file);
		return this.parse(await fetch(this.url(`/api/v1/projects/${projectId}/documents`), { method: 'POST', credentials: 'include', body: form }));
	}

	/** All ingested documents for a project (newest first). */
	async listDocuments(projectId: string): Promise<DocumentSummary[]> {
		const { documents } = await this.parse<{ documents: DocumentSummary[] }>(
			await fetch(this.url(`/api/v1/projects/${projectId}/documents`), { credentials: 'include' })
		);
		return documents;
	}

	/** Remove an ingested document — purges its vectors, raw upload, and record. */
	async deleteDocument(projectId: string, documentId: string): Promise<void> {
		const res = await fetch(this.url(`/api/v1/projects/${projectId}/documents/${documentId}`), { method: 'DELETE', credentials: 'include' });
		if (!res.ok && res.status !== 204) await this.parse(res);
	}

	async getJob(jobId: string): Promise<Job> {
		return this.parse(await fetch(this.url(`/api/v1/jobs/${jobId}`), { credentials: 'include' }));
	}

	// --- Search ---
	async search(projectId: string, query: string, mode: string): Promise<SearchResponse> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/search`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, mode }),
			})
		);
	}

	// --- Chat ---
	async chat(projectId: string, question: string, conversationId?: string): Promise<ChatResponse> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/chat`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question, conversationId }),
			})
		);
	}

	/** All conversations for a project (pinned first, then newest). */
	async listChats(projectId: string): Promise<Conversation[]> {
		const { conversations } = await this.parse<{ conversations: Conversation[] }>(
			await fetch(this.url(`/api/v1/projects/${projectId}/chats`), { credentials: 'include' })
		);
		return conversations;
	}

	/** Pin/unpin or rename a conversation. */
	async updateChat(projectId: string, chatId: string, patch: { title?: string; pinned?: boolean }): Promise<Conversation> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/chats/${chatId}`), {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			})
		);
	}

	/** Delete a conversation and all of its messages. */
	async deleteChat(projectId: string, chatId: string): Promise<void> {
		const res = await fetch(this.url(`/api/v1/projects/${projectId}/chats/${chatId}`), { method: 'DELETE', credentials: 'include' });
		if (!res.ok && res.status !== 204) await this.parse(res);
	}

	/** Full message history for a conversation. */
	async getMessages(projectId: string, chatId: string): Promise<ChatMessage[]> {
		const { messages } = await this.parse<{ messages: ChatMessage[] }>(
			await fetch(this.url(`/api/v1/projects/${projectId}/chats/${chatId}/messages`), { credentials: 'include' })
		);
		return messages;
	}

	// --- Evaluation ---
	async runEvaluation(projectId: string, cases: GoldenCase[]): Promise<EvaluationReport> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/evaluation/run`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cases }),
			})
		);
	}

	// --- Repositories ---
	async listRepositories(projectId: string): Promise<Repository[]> {
		const { repositories } = await this.parse<{ repositories: Repository[] }>(
			await fetch(this.url(`/api/v1/projects/${projectId}/repositories`), { credentials: 'include' })
		);
		return repositories;
	}

	async connectGitHub(projectId: string, remoteUrl: string): Promise<unknown> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/repositories`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ source: 'github', remoteUrl }),
			})
		);
	}

	async syncRepository(projectId: string, repositoryId: string): Promise<unknown> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/repositories/${repositoryId}/sync`), { method: 'POST', credentials: 'include' })
		);
	}

	/** Disconnect a repository — purges its code vectors, archive, and record. */
	async deleteRepository(projectId: string, repositoryId: string): Promise<void> {
		const res = await fetch(this.url(`/api/v1/projects/${projectId}/repositories/${repositoryId}`), { method: 'DELETE', credentials: 'include' });
		if (!res.ok && res.status !== 204) await this.parse(res);
	}

	// --- Connectors (unified knowledge sources) ---
	/** Every connected source for a project (GitHub, Documents, Slack) with per-source stats. */
	async listConnectors(projectId: string): Promise<Connector[]> {
		const { connectors } = await this.parse<{ connectors: Connector[] }>(await fetch(this.url(`/api/v1/projects/${projectId}/connectors`), { credentials: 'include' }));
		return connectors;
	}

	/** Disconnect any source — purges its vectors and cascades its detail rows. */
	async deleteConnector(projectId: string, connectorId: string): Promise<void> {
		const res = await fetch(this.url(`/api/v1/projects/${projectId}/connectors/${connectorId}`), { method: 'DELETE', credentials: 'include' });
		if (!res.ok && res.status !== 204) await this.parse(res);
	}

	// --- Slack connector ---
	/** Begin Slack OAuth — returns the authorize URL the browser navigates to. */
	async startSlackOAuth(projectId: string): Promise<{ authorizeUrl: string }> {
		return this.parse(await fetch(this.url(`/api/v1/projects/${projectId}/connectors/slack/oauth/start`), { method: 'POST', credentials: 'include' }));
	}

	/** Finish Slack OAuth from the same-origin callback route. */
	async completeSlackOAuth(projectId: string, code: string, state: string): Promise<{ connectorId: string; workspaceId: string; teamName: string | null; channelCount: number }> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/connectors/slack/oauth/complete`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, state }),
			})
		);
	}

	async listSlackChannels(projectId: string, connectorId: string): Promise<SlackChannelSummary[]> {
		const { channels } = await this.parse<{ channels: SlackChannelSummary[] }>(
			await fetch(this.url(`/api/v1/projects/${projectId}/connectors/slack/${connectorId}/channels`), { credentials: 'include' })
		);
		return channels;
	}

	/** Persist the channels to ingest and queue ingestion. */
	async selectSlackChannels(projectId: string, connectorId: string, channelIds: string[]): Promise<{ jobId: string; selectedCount: number }> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/connectors/slack/${connectorId}/channels`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ channelIds }),
			})
		);
	}

	/** Queue an incremental Slack sync (only changed conversations are reprocessed). */
	async syncSlack(projectId: string, connectorId: string): Promise<{ jobId: string }> {
		return this.parse(await fetch(this.url(`/api/v1/projects/${projectId}/connectors/slack/${connectorId}/sync`), { method: 'POST', credentials: 'include' }));
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
