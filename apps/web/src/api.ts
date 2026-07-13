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

export interface ChatCitation {
	sourcePath: string;
	chunkId?: string;
	score: number;
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
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
