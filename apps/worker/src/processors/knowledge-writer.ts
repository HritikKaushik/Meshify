import type { Project } from '@meshify/data-access';
import type { KnowledgeItem, KnowledgeWriter } from '@meshify/providers';
import type { RagPort } from '@meshify/rocketride-gateway';
import { resolveIngestToken, type IngestTokenDeps } from './resolve-ingest-token.js';

/** Purges vectors by their source paths — the write-side of purge-before-reingest. */
export interface VectorDeleter {
	deleteBySourcePaths(collection: string, paths: string[]): Promise<void>;
}

/**
 * The ConnectorEngine's write side over RocketRide + Qdrant, scoped to one
 * project (per-job construction). Ingest-pipeline tokens resolve lazily per
 * target and are cached for the job's lifetime.
 */
export class ProjectKnowledgeWriter implements KnowledgeWriter {
	private readonly tokens = new Map<'documents' | 'code', Promise<string>>();

	constructor(
		private readonly project: Project,
		private readonly rag: RagPort,
		private readonly vectors: VectorDeleter,
		private readonly tokenDeps: IngestTokenDeps,
		private readonly chunkSizes: { documents: number; code: number }
	) {}

	private ingestToken(target: 'documents' | 'code'): Promise<string> {
		let token = this.tokens.get(target);
		if (!token) {
			token = resolveIngestToken(this.project, target, this.chunkSizes[target], this.tokenDeps);
			this.tokens.set(target, token);
		}
		return token;
	}

	async embed(target: 'documents' | 'code', items: KnowledgeItem[]): Promise<void> {
		const token = await this.ingestToken(target);
		const files = items.map((item) => ({
			path: item.sourceRef,
			buffer: typeof item.content === 'string' ? Buffer.from(item.content, 'utf8') : item.content,
			mimeType: item.mimeType ?? 'text/plain',
		}));
		const result = await this.rag.ingestFiles(token, files);
		if (!result.completed) throw new Error(`Knowledge ingestion reported errors: ${result.errors.join('; ')}`);
	}

	async deleteBySourceRefs(target: 'documents' | 'code', sourceRefs: string[]): Promise<void> {
		if (sourceRefs.length === 0) return;
		const collection = target === 'documents' ? this.project.qdrantCollectionDocs : this.project.qdrantCollectionCode;
		await this.vectors.deleteBySourcePaths(collection, sourceRefs);
	}
}
