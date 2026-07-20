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

export type JobPhase = 'running' | 'progress' | 'completed' | 'failed' | 'retry';

/** A real-time job progress event (from the SSE stream) or a snapshot item (from GET /jobs). */
export interface JobEvent {
	jobId: string;
	projectId: string;
	jobType: string;
	title: string;
	phase: JobPhase;
	stage?: string;
	percent?: number;
	message?: string;
	attempt?: number;
	error?: string;
	at: string;
}

export interface JobsSnapshot {
	active: JobEvent[];
	recent: JobEvent[];
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

// --- Provider platform (org-scoped integrations) ---

export interface ProviderCapabilitiesDto {
	oauth: boolean;
	webhooks: boolean;
	fullSync: boolean;
	incrementalSync: boolean;
	realtimeEvents: boolean;
	manualSync: boolean;
	scheduledSync: boolean;
	resourcePicker: boolean;
	healthCheck: boolean;
	byoa: boolean;
	permissions: boolean;
	tools: boolean;
}

/** One marketplace catalog entry — a provider manifest + whether this deployment can operate it. */
export interface ProviderCatalogEntry {
	id: string;
	providerVersion: string;
	displayName: string;
	category: 'code' | 'chat' | 'docs' | 'tickets' | 'storage' | 'crm';
	availability: 'available' | 'coming_soon';
	capabilities: ProviderCapabilitiesDto;
	auth: { type: string; scopes?: string[] };
	iconKey: string;
	brandColor?: string;
	summary: string;
	configured: boolean;
}

export type IntegrationHealth =
	| 'unknown'
	| 'healthy'
	| 'syncing'
	| 'token_expired'
	| 'permission_changed'
	| 'webhook_broken'
	| 'needs_reauthorization'
	| 'partially_connected'
	| 'disconnected';

/** An org-level provider connection (a GitHub installation, a Slack workspace install). */
export interface Integration {
	id: string;
	provider: string;
	mode: 'managed' | 'byoa';
	externalAccountId: string;
	externalAccountName: string;
	status: 'pending' | 'active' | 'error' | 'revoked' | 'disconnected';
	health: IntegrationHealth;
	healthCheckedAt: string | null;
	accountType: string | null;
	avatarUrl: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
	connectorCount: number;
	connectedProjectIds: string[];
}

/** A selectable resource of a connected grant, with its already-attached flag. */
export interface IntegrationResource {
	id: string;
	name: string;
	kind: string;
	private: boolean;
	connected: boolean;
	extra?: Record<string, unknown>;
}

export interface CompleteConnectResponse {
	integration: Integration;
	returnPath: string | null;
	projectId: string | null;
	intent: 'connect' | 'reconnect';
}

/** One field of a provider's bring-your-own-app config form; secrets are write-only. */
export interface ByoaFieldView {
	key: string;
	label: string;
	secret: boolean;
	multiline: boolean;
	placeholder?: string;
	/** Whether a value is already stored (secrets are never echoed back). */
	configured: boolean;
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

	/** A document's raw bytes — used to render PDF thumbnails in the Documents grid. */
	async getDocumentContent(projectId: string, documentId: string): Promise<ArrayBuffer> {
		const res = await fetch(this.url(`/api/v1/projects/${projectId}/documents/${documentId}/content`), { credentials: 'include' });
		if (!res.ok) throw new ApiError(res.status, `Failed to fetch document content (${res.status})`);
		return res.arrayBuffer();
	}

	/** The URL of a document's raw content — open in a new tab to view it inline. */
	documentContentUrl(projectId: string, documentId: string): string {
		return this.url(`/api/v1/projects/${projectId}/documents/${documentId}/content`);
	}

	// --- Background jobs (real-time) ---
	/** Snapshot of a project's active jobs + recent history (first paint / SSE fallback). */
	async listJobs(projectId: string): Promise<JobsSnapshot> {
		return this.parse(await fetch(this.url(`/api/v1/projects/${projectId}/jobs`), { credentials: 'include' }));
	}

	/** The SSE endpoint for live job progress — opened by the Job Progress Center via EventSource. */
	jobsStreamUrl(projectId: string): string {
		return this.url(`/api/v1/projects/${projectId}/jobs/stream`);
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

	// --- Provider platform (org-scoped integrations) ---

	/** The marketplace catalog: every provider's manifest, available + coming soon. */
	async listProviders(): Promise<ProviderCatalogEntry[]> {
		return this.parse(await fetch(this.url('/api/v1/providers'), { credentials: 'include' }));
	}

	/** The org's provider connections with attachment summaries. */
	async listIntegrations(): Promise<Integration[]> {
		return this.parse(await fetch(this.url('/api/v1/integrations'), { credentials: 'include' }));
	}

	/** Begin an org-level connect — returns the provider consent/install URL to navigate to. */
	async connectProvider(provider: string, opts: { projectId?: string; returnPath?: string } = {}): Promise<{ url: string }> {
		return this.parse(
			await fetch(this.url(`/api/v1/integrations/${provider}/connect`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(opts),
			})
		);
	}

	/** Finish a connect from the generic /oauth/:provider/callback route — raw redirect params pass through verbatim. */
	async completeProviderConnect(provider: string, state: string, params: Record<string, string>): Promise<CompleteConnectResponse> {
		return this.parse(
			await fetch(this.url(`/api/v1/integrations/${provider}/callback`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ state, params }),
			})
		);
	}

	/** Re-run the consent flow for an existing integration (expired grants, scope changes). */
	async reconnectIntegration(integrationId: string, returnPath?: string): Promise<{ url: string }> {
		return this.parse(
			await fetch(this.url(`/api/v1/integrations/${integrationId}/reconnect`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ returnPath }),
			})
		);
	}

	/** Org-level disconnect: revokes best-effort, purges credentials, flags dependent project connectors. */
	async disconnectIntegration(integrationId: string): Promise<void> {
		const res = await fetch(this.url(`/api/v1/integrations/${integrationId}`), { method: 'DELETE', credentials: 'include' });
		if (!res.ok && res.status !== 204) await this.parse(res);
	}

	/** Live resource listing for the picker (repos of an installation, channels of a workspace). */
	async listIntegrationResources(integrationId: string): Promise<{ resources: IntegrationResource[]; nextCursor?: string }> {
		return this.parse(await fetch(this.url(`/api/v1/integrations/${integrationId}/resources`), { credentials: 'include' }));
	}

	/** Bind an org Slack integration to a project — no second OAuth. */
	async attachSlackWorkspace(projectId: string, integrationId: string): Promise<{ connectorId: string; workspaceId: string; teamName: string | null; channelCount: number; alreadyAttached: boolean }> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/connectors/slack`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ integrationId }),
			})
		);
	}

	/** Picker-based repository connect via the org's installation. */
	async connectRepoFromIntegration(projectId: string, integrationId: string, githubRepoId: string): Promise<{ repository: Repository; jobId: string }> {
		return this.parse(
			await fetch(this.url(`/api/v1/projects/${projectId}/repositories`), {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ integrationId, githubRepoId }),
			})
		);
	}

	/** The org's Provider Registration form for a provider — secrets report only whether they're set. */
	async describeRegistration(provider: string): Promise<{ mode: 'managed' | 'byoa'; fields: ByoaFieldView[] }> {
		return this.parse(await fetch(this.url(`/api/v1/providers/${provider}/registration`), { credentials: 'include' }));
	}

	/** Store the org's own provider-app credentials (write-only) — switches the org to BYOA for future connects. */
	async configureRegistration(provider: string, values: Record<string, string>): Promise<{ webhookPath: string }> {
		return this.parse(
			await fetch(this.url(`/api/v1/providers/${provider}/registration`), {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ values }),
			})
		);
	}

	/** Remove the org's BYOA registration for a provider (revert to managed). Throws (409) if integrations still use it. */
	async deleteRegistration(provider: string): Promise<void> {
		const res = await fetch(this.url(`/api/v1/providers/${provider}/registration`), { method: 'DELETE', credentials: 'include' });
		if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Failed to remove ${provider} app`);
	}

	/** Org-scoped SSE stream of integration events (connects, revocations, health changes). */
	integrationsStreamUrl(): string {
		return this.url('/api/v1/integrations/stream');
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
